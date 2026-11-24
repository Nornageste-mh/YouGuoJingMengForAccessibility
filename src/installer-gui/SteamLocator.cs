// 游郭惊梦 无障碍补丁安装器 —— Steam 库自动定位
// 逻辑与 src/install/install-player.ps1 等价并做了两点增强：
//   * 注册表读取同时覆盖 64/32 位视图（HKLM\SOFTWARE\Valve\Steam 与 WOW6432Node）；
//   * 除 libraryfolders.vdf 的 "path" 外，额外用 appmanifest_3299340.acf 的 installdir 定位。
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace YouguoInstaller
{
    internal static class SteamLocator
    {
        public const string GameName = "游郭惊梦";
        public const string GameAppId = "3299340";
        private const int MaxDepthGuard = 1; // 仅用于将来扩展；当前只扫描 common 一级

        private static readonly string[] GameDirNameHints = new string[] { "游郭惊梦" };

        /// <summary>返回所有可用的游戏根目录（含 Kaede.exe 的目录），按发现顺序去重。</summary>
        public static List<string> FindGameDirs()
        {
            List<string> hits = new List<string>();
            List<string> libraries = GetLibraryRoots();

            foreach (string lib in libraries)
            {
                string common = Path.Combine(lib, "steamapps", "common");
                if (!Directory.Exists(common)) continue;

                // 1) appmanifest_3299340.acf —— 最可靠：直接给出安装目录名
                string acf = Path.Combine(lib, "steamapps", "appmanifest_" + GameAppId + ".acf");
                if (File.Exists(acf))
                {
                    string text = SafeReadAllText(acf);
                    if (text != null)
                    {
                        Match m = Regex.Match(text, "\"installdir\"\\s+\"([^\"]+)\"");
                        if (m.Success)
                        {
                            AddGameCandidate(hits, Path.Combine(common, UnescapeVdfPath(m.Groups[1].Value)));
                        }
                    }
                }

                // 2) 直接目录名
                foreach (string hint in GameDirNameHints)
                {
                    AddGameCandidate(hits, Path.Combine(common, hint));
                }

                // 3) common 下名字包含「游郭惊梦」的目录（中文路径变体/改名容错）
                string[] subDirs;
                try { subDirs = Directory.GetDirectories(common); }
                catch { subDirs = new string[0]; }
                foreach (string dir in subDirs)
                {
                    string name = Path.GetFileName(dir);
                    bool nameHit = false;
                    foreach (string hint in GameDirNameHints)
                    {
                        if (name.IndexOf(hint, StringComparison.Ordinal) >= 0) { nameHit = true; break; }
                    }
                    if (nameHit) AddGameCandidate(hits, dir);
                }
            }

            return hits;
        }

        private static void AddGameCandidate(List<string> hits, string gameRoot)
        {
            try
            {
                gameRoot = Path.GetFullPath(gameRoot).TrimEnd('\\');
            }
            catch { return; }

            string index = Path.Combine(gameRoot, "resources", "app", "index.html");
            if (!File.Exists(index)) return;
            AddUniquePath(hits, gameRoot);
        }

        private static List<string> GetLibraryRoots()
        {
            List<string> steamRoots = new List<string>();

            AddRegSteamRoot(RegistryHive.CurrentUser, RegistryView.Default,
                @"Software\Valve\Steam", new string[] { "SteamPath", "InstallPath", "SteamExe" }, steamRoots);
            AddRegSteamRoot(RegistryHive.LocalMachine, RegistryView.Registry64,
                @"SOFTWARE\Valve\Steam", new string[] { "InstallPath", "SteamPath" }, steamRoots);
            AddRegSteamRoot(RegistryHive.LocalMachine, RegistryView.Registry32,
                @"SOFTWARE\Valve\Steam", new string[] { "InstallPath", "SteamPath" }, steamRoots);

            List<string> libraries = new List<string>();
            foreach (string root in steamRoots)
            {
                if (!Directory.Exists(root)) continue;
                AddUniquePath(libraries, root);
                CollectLibraryFolders(root, libraries);
            }
            return libraries;
        }

        private static void AddRegSteamRoot(RegistryHive hive, RegistryView view, string subKey,
            string[] valueNames, List<string> roots)
        {
            try
            {
                using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, view))
                using (RegistryKey key = baseKey.OpenSubKey(subKey))
                {
                    if (key == null) return;
                    foreach (string name in valueNames)
                    {
                        object raw = key.GetValue(name);
                        string value = raw as string;
                        if (string.IsNullOrEmpty(value)) continue;
                        string normalized = NormalizeSteamPath(value);
                        if (normalized != null && !ContainsPath(roots, normalized)) roots.Add(normalized);
                    }
                }
            }
            catch { }
        }

        private static string NormalizeSteamPath(string value)
        {
            string s = value.Trim().Trim('"');
            if (s.Length == 0) return null;
            try { s = Environment.ExpandEnvironmentVariables(s); }
            catch { }
            try { s = Path.GetFullPath(s); }
            catch { return null; }
            // SteamExe 指向 steam.exe；取所在目录
            if (s.EndsWith("steam.exe", StringComparison.OrdinalIgnoreCase))
            {
                s = Path.GetDirectoryName(s);
                if (string.IsNullOrEmpty(s)) return null;
            }
            return s.TrimEnd('\\');
        }

        private static void CollectLibraryFolders(string steamRoot, List<string> libraries)
        {
            string vdf = Path.Combine(steamRoot, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(vdf)) return;
            string text = SafeReadAllText(vdf);
            if (text == null) return;

            // 新版格式："path"  "D:\\SteamLibrary"
            foreach (Match m in Regex.Matches(text, "\"path\"\\s+\"([^\"]+)\""))
            {
                AddIfDirectory(libraries, UnescapeVdfPath(m.Groups[1].Value));
            }
            // 旧版格式："1"  "D:\\SteamLibrary"
            foreach (Match m in Regex.Matches(text, "^\\s*\"\\d+\"\\s+\"([^\"]+)\"", RegexOptions.Multiline))
            {
                AddIfDirectory(libraries, UnescapeVdfPath(m.Groups[1].Value));
            }
        }

        private static void AddIfDirectory(List<string> libraries, string path)
        {
            if (string.IsNullOrEmpty(path)) return;
            try
            {
                string full = Path.GetFullPath(path).TrimEnd('\\');
                if (Directory.Exists(full)) AddUniquePath(libraries, full);
            }
            catch { }
        }

        private static string UnescapeVdfPath(string raw)
        {
            if (raw == null) return null;
            return raw.Replace("\\\\", "\\");
        }

        private static string SafeReadAllText(string path)
        {
            try { return File.ReadAllText(path); }
            catch { return null; }
        }

        private static bool ContainsPath(List<string> list, string path)
        {
            string key = NormalizeKey(path);
            foreach (string item in list)
            {
                if (NormalizeKey(item) == key) return true;
            }
            return false;
        }

        private static void AddUniquePath(List<string> list, string path)
        {
            if (!ContainsPath(list, path)) list.Add(path);
        }

        private static string NormalizeKey(string path)
        {
            if (path == null) return string.Empty;
            return path.Replace('/', '\\').TrimEnd('\\').ToLowerInvariant();
        }
    }
}
