// 游郭惊梦 无障碍补丁安装器 —— 核心安装/卸载/检测逻辑
// 与 src/install/install-patch.ps1、uninstall-patch.ps1、install-player.ps1 行为等价：
//   * 备份 index.html → index.html.a11y-backup（仅首次安装备份）
//   * 在 </body> 前注入 3 行标记 + 脚本标签
//   * 安装清单 install-manifest.json 字段与 PowerShell 版一致
//   * 卸载 = 从备份还原 index.html + 删除 a11y-patch 目录 + 删除备份
// C# 5 语法（csc.exe v4.0.30319），不依赖 PowerShell。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace YouguoInstaller
{
    /// <summary>面向用户的、带可操作提示的错误（CLI 退出码 2；GUI 弹对话框）。</summary>
    internal sealed class InstallerException : Exception
    {
        public InstallerException(string message) : base(message) { }
    }

    internal static class PatchInfo
    {
        public const string PatchName = "youguo-jingmeng-a11y";
        public const string GameName = SteamLocator.GameName;
        public const string PatchDirName = "a11y-patch";
        public const string EntryName = "a11y-boot.js";
        public const string BackupName = "index.html.a11y-backup";
        public const string ManifestName = "install-manifest.json";
        public const string MarkerOpen = "<!-- a11y-patch -->";
        public const string MarkerClose = "<!-- /a11y-patch -->";
        public const string ScriptSrc = "./a11y-patch/a11y-boot.js";
        public const string ExpectedOriginalIndexSha256 =
            "C4D26A95C41AD67412AE4D0D228F1C5CA1CE2B841775573DC93CD0D56BD94E99";
    }

    /// <summary>已解析的《游郭惊梦》目录（游戏根目录 + <game>\resources\app）。</summary>
    internal sealed class GameInstall
    {
        public string GameRoot { get; private set; }
        public string AppDir { get; private set; }

        public string IndexPath { get { return Path.Combine(AppDir, "index.html"); } }
        public string BackupPath { get { return Path.Combine(AppDir, PatchInfo.BackupName); } }
        public string PatchDirPath { get { return Path.Combine(AppDir, PatchInfo.PatchDirName); } }
        public string EntryPath { get { return Path.Combine(PatchDirPath, PatchInfo.EntryName); } }
        public string ManifestPath { get { return Path.Combine(PatchDirPath, PatchInfo.ManifestName); } }

        private GameInstall(string gameRoot, string appDir)
        {
            GameRoot = gameRoot;
            AppDir = appDir;
        }

        /// <summary>接受「游戏根目录」或「resources\app 目录」，返回解析结果。</summary>
        public static GameInstall Resolve(string input)
        {
            if (input == null || input.Trim().Length == 0)
            {
                throw new InstallerException(
                    "未指定游戏目录。\n\n请选择《游郭惊梦》游戏根文件夹（包含 Kaede.exe），例如：\n" +
                    "D:\\Steam\\steamapps\\common\\游郭惊梦");
            }

            string raw = input.Trim().Trim('"');
            string full;
            try { full = Path.GetFullPath(raw); }
            catch (Exception ex)
            {
                throw new InstallerException("游戏目录路径无效：" + raw + "\n\n" + ex.Message);
            }
            full = full.TrimEnd('\\');

            string indexUnderRoot = Path.Combine(full, "resources", "app", "index.html");
            if (File.Exists(indexUnderRoot))
            {
                return new GameInstall(full, Path.Combine(full, "resources", "app"));
            }

            string directIndex = Path.Combine(full, "index.html");
            if (File.Exists(directIndex))
            {
                string root = full;
                try
                {
                    DirectoryInfo appInfo = new DirectoryInfo(full);
                    DirectoryInfo resources = appInfo.Parent;
                    DirectoryInfo gameRoot = resources == null ? null : resources.Parent;
                    if (gameRoot != null) root = gameRoot.FullName;
                }
                catch { }
                return new GameInstall(root, full);
            }

            throw new InstallerException(
                "游戏目录无效：找不到 resources\\app\\index.html。\n\n" +
                "请选择《游郭惊梦》游戏根文件夹（包含 Kaede.exe 的文件夹），例如：\n" +
                "D:\\Steam\\steamapps\\common\\游郭惊梦\n\n当前路径：" + full);
        }

        /// <summary>未显式给目录时自动定位；多个候选时报错要求显式指定。</summary>
        public static GameInstall ResolveOrAuto(string input)
        {
            if (input != null && input.Trim().Length > 0) return Resolve(input);

            List<string> hits = SteamLocator.FindGameDirs();
            if (hits.Count == 0)
            {
                throw new InstallerException(
                    "未能自动找到《游郭惊梦》安装目录（Steam 库可能不在默认位置）。\n\n" +
                    "请手动指定游戏根文件夹（包含 Kaede.exe），例如：\n" +
                    "D:\\Steam\\steamapps\\common\\游郭惊梦");
            }
            if (hits.Count > 1)
            {
                throw new InstallerException("找到多个候选游戏目录，请显式指定其中一个：\n\n" +
                    string.Join("\n", hits.ToArray()));
            }
            return Resolve(hits[0]);
        }
    }

    /// <summary>EXE 同目录的补丁源（a11y-patch\）。</summary>
    internal sealed class PatchSource
    {
        public string Root { get; private set; }
        public string Version { get; private set; }
        public int FileCount { get; private set; }

        public string EntryPath { get { return Path.Combine(Root, PatchInfo.EntryName); } }

        private PatchSource(string root, string version, int fileCount)
        {
            Root = root;
            Version = version;
            FileCount = fileCount;
        }

        public static string ExeDirectory()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                if (!string.IsNullOrEmpty(baseDir)) return baseDir.TrimEnd('\\');
            }
            catch { }
            try
            {
                string loc = Assembly.GetExecutingAssembly().Location;
                if (!string.IsNullOrEmpty(loc)) return Path.GetDirectoryName(loc);
            }
            catch { }
            return Environment.CurrentDirectory;
        }

        public static PatchSource TryFind()
        {
            string root = Path.Combine(ExeDirectory(), PatchInfo.PatchDirName);
            string entry = Path.Combine(root, PatchInfo.EntryName);
            if (!File.Exists(entry)) return null;

            int count = 0;
            try { count = Directory.GetFiles(root, "*", SearchOption.AllDirectories).Length; }
            catch { }
            string version = ParseVersionFromFile(entry);
            return new PatchSource(root, version, count);
        }

        public static PatchSource Find()
        {
            PatchSource source = TryFind();
            if (source == null) throw new InstallerException(NotFoundMessage());
            return source;
        }

        public static string NotFoundMessage()
        {
            string expected = Path.Combine(ExeDirectory(), PatchInfo.PatchDirName, PatchInfo.EntryName);
            return "找不到补丁文件：" + expected + "\n\n" +
                   "请把本安装器 EXE 放在发布包解压目录中（与 a11y-patch 文件夹同级）后再运行。";
        }

        /// <summary>从 a11y-boot.js 解析 var VERSION = '0.1.0'。</summary>
        public static string ParseVersionFromFile(string bootJsPath)
        {
            string text;
            try { text = File.ReadAllText(bootJsPath); }
            catch { return "未标注"; }

            Match m = Regex.Match(text, "var\\s+VERSION\\s*=\\s*['\"]([0-9A-Za-z._-]+)['\"]");
            if (!m.Success) m = Regex.Match(text, "VERSION\\s*=\\s*['\"]([0-9A-Za-z._-]+)['\"]");
            return m.Success ? m.Groups[1].Value : "未标注";
        }
    }

    internal enum InstallStateKind
    {
        DirInvalid,
        NotInstalled,
        Installed,
        Broken
    }

    /// <summary>某目录的安装状态快照。</summary>
    internal sealed class InstallState
    {
        public InstallStateKind Kind = InstallStateKind.DirInvalid;
        public string StatusText = "目录无效";
        public string Version = "";
        public int MarkerCount;
        public int ScriptTagCount;
        public int ClosingMarkerCount;
        public bool IndexExists;
        public bool BackupExists;
        public bool PatchDirExists;
        public bool EntryExists;
        public bool ManifestExists;
        public string ManifestVersion = "";
        public string ManifestInstalledAt = "";
        public string ManifestIndexHash = "";

        public bool IsInstalled { get { return Kind == InstallStateKind.Installed; } }
    }

    /// <summary>一次安装/卸载操作的报告（CLI 打印，GUI 写日志）。</summary>
    internal sealed class OperationReport
    {
        public string Action = "";
        public string GameRoot = "";
        public string AppDir = "";
        public string Version = "";
        public string IndexHash = "";
        public int MarkerCount;
        public bool Changed = true;
        public List<string> Lines = new List<string>();

        public void Add(string line) { Lines.Add(line); }
    }

    internal static class InstallerEngine
    {
        // ---------------------------------------------------------------- 状态

        public static InstallState GetState(GameInstall game)
        {
            InstallState state = new InstallState();
            state.IndexExists = File.Exists(game.IndexPath);
            state.BackupExists = File.Exists(game.BackupPath);
            state.PatchDirExists = Directory.Exists(game.PatchDirPath);
            state.EntryExists = File.Exists(game.EntryPath);
            state.ManifestExists = File.Exists(game.ManifestPath);

            string html = null;
            if (state.IndexExists)
            {
                try { html = File.ReadAllText(game.IndexPath, new UTF8Encoding(false)); }
                catch { html = null; }
            }

            if (html != null)
            {
                state.MarkerCount = CountOccurrences(html, PatchInfo.MarkerOpen);
                state.ClosingMarkerCount = CountOccurrences(html, PatchInfo.MarkerClose);
                state.ScriptTagCount = Regex.Matches(html, Regex.Escape("a11y-patch/a11y-boot.js")).Count;
            }

            if (state.ManifestExists) ReadManifest(game.ManifestPath, state);

            string installedVersion = state.ManifestVersion;
            if (string.IsNullOrEmpty(installedVersion) && state.EntryExists)
            {
                installedVersion = PatchSource.ParseVersionFromFile(game.EntryPath);
            }

            if (!state.IndexExists)
            {
                state.Kind = InstallStateKind.DirInvalid;
                state.StatusText = "目录无效（缺少 index.html）";
                return state;
            }
            if (html == null)
            {
                state.Kind = InstallStateKind.Broken;
                state.StatusText = "异常：无法读取 index.html（文件被占用？）";
                return state;
            }
            if (state.MarkerCount > 0)
            {
                if (!state.BackupExists)
                {
                    state.Kind = InstallStateKind.Broken;
                    state.StatusText = "异常：缺少原始备份 index.html.a11y-backup，无法安全卸载";
                }
                else if (!state.PatchDirExists || !state.EntryExists)
                {
                    state.Kind = InstallStateKind.Broken;
                    state.StatusText = "异常：补丁目录或入口文件缺失（a11y-patch\\a11y-boot.js）";
                }
                else
                {
                    state.Kind = InstallStateKind.Installed;
                    state.Version = installedVersion;
                    state.StatusText = string.IsNullOrEmpty(installedVersion)
                        ? "已安装"
                        : "已安装 " + installedVersion;
                }
            }
            else
            {
                if (state.BackupExists || state.PatchDirExists)
                {
                    state.Kind = InstallStateKind.Broken;
                    state.StatusText = "异常：检测到补丁残留（备份/补丁目录），但 index.html 未注入";
                }
                else
                {
                    state.Kind = InstallStateKind.NotInstalled;
                    state.StatusText = "未安装";
                }
            }
            return state;
        }

        private static void ReadManifest(string manifestPath, InstallState state)
        {
            string text;
            try { text = File.ReadAllText(manifestPath, new UTF8Encoding(false)); }
            catch { return; }

            Match m = Regex.Match(text, "\"patchVersion\"\\s*:\\s*\"([^\"]*)\"");
            if (m.Success) state.ManifestVersion = m.Groups[1].Value;
            m = Regex.Match(text, "\"installedAt\"\\s*:\\s*\"([^\"]*)\"");
            if (m.Success) state.ManifestInstalledAt = m.Groups[1].Value;
            m = Regex.Match(text, "\"indexHash\"\\s*:\\s*\"([0-9A-Fa-f]*)\"");
            if (m.Success) state.ManifestIndexHash = m.Groups[1].Value;
        }

        // ---------------------------------------------------------------- 进程

        public static int CountRunningGameProcesses()
        {
            try
            {
                Process[] processes = Process.GetProcessesByName("Kaede");
                return processes.Length;
            }
            catch { return 0; }
        }

        public static void EnsureGameNotRunning()
        {
            int running = CountRunningGameProcesses();
            if (running > 0)
            {
                throw new InstallerException(
                    "游戏正在运行（检测到 " + running + " 个 Kaede 进程）。\n\n" +
                    "请先完全退出游戏（关闭游戏窗口；必要时在任务管理器结束 Kaede.exe），然后重试。");
            }
        }

        // ---------------------------------------------------------------- 安装

        public static OperationReport Install(GameInstall game, PatchSource source)
        {
            if (source == null) throw new InstallerException(PatchSource.NotFoundMessage());

            EnsureGameNotRunning();

            OperationReport report = new OperationReport();
            report.Action = "install";
            report.GameRoot = game.GameRoot;
            report.AppDir = game.AppDir;
            report.Version = source.Version;

            InstallState before = GetState(game);
            if (before.MarkerCount > 0)
            {
                string installed = string.IsNullOrEmpty(before.Version) ? before.StatusText : before.Version;
                throw new InstallerException(
                    "该目录已安装补丁（" + installed + "），不能重复安装。\n\n" +
                    "如需重装或升级：请先点击「卸载」，再重新安装。\n\n目录：" + game.AppDir);
            }

            string html;
            try { html = File.ReadAllText(game.IndexPath, new UTF8Encoding(false)); }
            catch (Exception ex)
            {
                throw new InstallerException("无法读取 index.html：" + ex.Message +
                    "\n\n请确认文件未被占用、无只读属性：" + game.IndexPath);
            }

            string snippet = PatchInfo.MarkerOpen + "\r\n" +
                             "<script type=\"text/javascript\" src=\"" + PatchInfo.ScriptSrc + "\"></script>\r\n" +
                             PatchInfo.MarkerClose;
            string newHtml;
            if (Regex.IsMatch(html, "</body>", RegexOptions.IgnoreCase))
            {
                newHtml = Regex.Replace(html, "</body>",
                    delegate(Match m) { return snippet + "\r\n</body>"; },
                    RegexOptions.IgnoreCase);
            }
            else
            {
                newHtml = html + "\r\n" + snippet;
            }

            // 1) 首次安装才备份（升级/重装保留最初备份）
            if (!File.Exists(game.BackupPath))
            {
                try { File.Copy(game.IndexPath, game.BackupPath, false); }
                catch (Exception ex)
                {
                    throw new InstallerException("备份 index.html 失败：" + ex.Message +
                        "\n\n请检查目录写入权限：" + game.AppDir);
                }
                report.Add("已备份 index.html → " + PatchInfo.BackupName);
            }
            else
            {
                report.Add("已存在原始备份，保留不覆盖：" + PatchInfo.BackupName);
            }

            // 2) 复制补丁目录（先清空旧的）
            try
            {
                if (Directory.Exists(game.PatchDirPath)) Directory.Delete(game.PatchDirPath, true);
                CopyDirectory(source.Root, game.PatchDirPath);
            }
            catch (Exception ex)
            {
                throw new InstallerException("复制补丁文件失败：" + ex.Message +
                    "\n\n请检查目录写入权限：" + game.AppDir);
            }
            report.Add("已复制补丁文件 " + source.FileCount + " 个 → " + PatchInfo.PatchDirName + "\\");

            // 3) 写 index.html（UTF-8 无 BOM，与原安装脚本一致）
            try { File.WriteAllText(game.IndexPath, newHtml, new UTF8Encoding(false)); }
            catch (Exception ex)
            {
                throw new InstallerException("写入 index.html 失败：" + ex.Message +
                    "\n\n请确认文件未被游戏占用、无只读属性。");
            }
            report.Add("已注入脚本标签（" + PatchInfo.MarkerOpen + " … " + PatchInfo.MarkerClose + " 共 3 行，位于 </body> 前）");

            // 4) 安装清单（indexHash = 原始 index.html 的 SHA256）
            string indexHash = Sha256File(game.BackupPath);
            string installedAt = DateTimeOffset.Now.ToString("yyyy-MM-ddTHH:mm:ssK", CultureInfo.InvariantCulture);
            string manifestJson = BuildManifestJson(source.Version, installedAt, indexHash, game.AppDir);
            try { File.WriteAllText(game.ManifestPath, manifestJson, new UTF8Encoding(false)); }
            catch (Exception ex)
            {
                throw new InstallerException("写入安装清单失败：" + ex.Message + "\n\n" + game.ManifestPath);
            }
            report.IndexHash = indexHash;
            report.Add("已写入安装清单：" + PatchInfo.PatchDirName + "\\" + PatchInfo.ManifestName +
                       "（indexHash=" + indexHash + "）");

            // 5) 安装后自检
            InstallState after = GetState(game);
            report.MarkerCount = after.MarkerCount;
            if (after.Kind != InstallStateKind.Installed)
            {
                throw new InstallerException("安装后自检失败：状态为「" + after.StatusText +
                    "」。\n\n请检查目录：" + game.AppDir);
            }
            report.Add("安装完成。可启动游戏验证（需 NVDA 已运行）。");
            return report;
        }

        // ---------------------------------------------------------------- 卸载

        public static OperationReport Uninstall(GameInstall game)
        {
            EnsureGameNotRunning();

            OperationReport report = new OperationReport();
            report.Action = "uninstall";
            report.GameRoot = game.GameRoot;
            report.AppDir = game.AppDir;

            InstallState state = GetState(game);
            if (state.Kind == InstallStateKind.DirInvalid)
            {
                throw new InstallerException("游戏目录无效：找不到 index.html。\n\n目录：" + game.AppDir);
            }

            bool marker = state.MarkerCount > 0;
            if (!state.BackupExists)
            {
                if (state.PatchDirExists || marker)
                {
                    throw new InstallerException(
                        "检测到补丁痕迹但缺少原始备份 index.html.a11y-backup，无法安全卸载。\n\n" +
                        "请用 Steam 验证游戏文件完整性（库 → 右键《游郭惊梦》→ 属性 → 本地文件 → 验证文件完整性）" +
                        "恢复原始文件，然后手动删除 a11y-patch 目录。\n\n游戏目录：" + game.AppDir);
                }
                report.Changed = false;
                report.Add("未发现已安装的补丁（无备份、无补丁目录），无需卸载。");
                report.Add("state: not-installed");
                return report;
            }

            string backupHash = Sha256File(game.BackupPath);
            if (!string.IsNullOrEmpty(state.ManifestIndexHash) &&
                !string.Equals(state.ManifestIndexHash, backupHash, StringComparison.OrdinalIgnoreCase))
            {
                report.Add("警告：备份文件 SHA256 与安装清单不一致（备份可能被修改），仍按备份还原。");
            }

            // 1) 从备份还原 index.html
            try { File.Copy(game.BackupPath, game.IndexPath, true); }
            catch (Exception ex)
            {
                throw new InstallerException("恢复 index.html 失败：" + ex.Message +
                    "\n\n请检查文件是否被占用/只读，或手动把 index.html.a11y-backup 复制为 index.html。\n目录：" +
                    game.AppDir);
            }
            report.IndexHash = backupHash;
            report.Add("已从备份恢复 index.html");

            // 2) 删除补丁目录
            if (Directory.Exists(game.PatchDirPath))
            {
                try { Directory.Delete(game.PatchDirPath, true); }
                catch (Exception ex)
                {
                    throw new InstallerException("删除 a11y-patch 目录失败：" + ex.Message +
                        "\n\n请关闭占用该目录的程序后重试，或手动删除：" + game.PatchDirPath);
                }
                report.Add("已删除 a11y-patch 目录");
            }

            // 3) 删除备份（对应 PowerShell 版 -ErrorAction SilentlyContinue）
            try
            {
                File.Delete(game.BackupPath);
                report.Add("已删除原始备份 " + PatchInfo.BackupName);
            }
            catch (Exception ex)
            {
                report.Add("警告：删除备份失败：" + ex.Message);
            }

            // 4) 卸载后自检
            InstallState after = GetState(game);
            report.MarkerCount = after.MarkerCount;
            if (after.Kind != InstallStateKind.NotInstalled)
            {
                throw new InstallerException("卸载后自检失败：状态为「" + after.StatusText +
                    "」。\n\n请手动检查目录：" + game.AppDir);
            }
            report.Add("卸载完成。可重新启动游戏验证恢复原状。");
            return report;
        }

        // ---------------------------------------------------------------- 工具

        public static string Sha256File(string path)
        {
            using (FileStream stream = File.OpenRead(path))
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(stream);
                StringBuilder sb = new StringBuilder(hash.Length * 2);
                foreach (byte b in hash) sb.Append(b.ToString("X2", CultureInfo.InvariantCulture));
                return sb.ToString();
            }
        }

        public static string BuildManifestJson(string version, string installedAt, string indexHash, string appDir)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{\r\n");
            sb.Append("  \"patchName\": \"" + PatchInfo.PatchName + "\",\r\n");
            sb.Append("  \"patchVersion\": \"" + JsonEscape(version) + "\",\r\n");
            sb.Append("  \"installedAt\": \"" + JsonEscape(installedAt) + "\",\r\n");
            sb.Append("  \"patchDir\": \"" + PatchInfo.PatchDirName + "\",\r\n");
            sb.Append("  \"entry\": \"" + PatchInfo.PatchDirName + "/" + PatchInfo.EntryName + "\",\r\n");
            sb.Append("  \"indexBackup\": \"" + PatchInfo.BackupName + "\",\r\n");
            sb.Append("  \"indexHash\": \"" + JsonEscape(indexHash) + "\",\r\n");
            sb.Append("  \"gameApp\": \"" + JsonEscape(appDir) + "\"\r\n");
            sb.Append("}\r\n");
            return sb.ToString();
        }

        public static string JsonEscape(string value)
        {
            if (value == null) return "";
            StringBuilder sb = new StringBuilder(value.Length + 8);
            foreach (char c in value)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ') sb.Append("\\u" + ((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }

        private static int CountOccurrences(string text, string needle)
        {
            return Regex.Matches(text, Regex.Escape(needle)).Count;
        }

        private static void CopyDirectory(string source, string destination)
        {
            Directory.CreateDirectory(destination);
            string[] files = Directory.GetFiles(source, "*", SearchOption.AllDirectories);
            foreach (string file in files)
            {
                string relative = file.Substring(source.Length).TrimStart('\\', '/');
                string target = Path.Combine(destination, relative);
                string targetDir = Path.GetDirectoryName(target);
                if (!string.IsNullOrEmpty(targetDir)) Directory.CreateDirectory(targetDir);
                File.Copy(file, target, true);
            }
        }
    }
}
