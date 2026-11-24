// 游郭惊梦 无障碍补丁安装器 —— 入口 / 命令行自测模式
// 同一个 EXE：无参数 = WinForms GUI；带 --detect/--install/--uninstall/--status = 无 GUI CLI。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace YouguoInstaller
{
    internal enum CliMode
    {
        Gui,
        Detect,
        Status,
        Install,
        Uninstall,
        Help,
        Version,
        Invalid
    }

    internal sealed class CliOptions
    {
        public CliMode Mode = CliMode.Gui;
        public string Directory = "";
        public string Error = "";
        public bool ModeChosen = false;

        public static CliOptions Parse(string[] args)
        {
            CliOptions options = new CliOptions();
            if (args == null || args.Length == 0) return options;

            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                if (arg == null || arg.Trim().Length == 0) continue;

                bool looksLikeOption = arg.StartsWith("--", StringComparison.Ordinal) ||
                                       (arg.StartsWith("-", StringComparison.Ordinal) && arg.Length > 1 &&
                                        !char.IsDigit(arg[1]) && arg[1] != '\\' && arg[1] != '/');
                if (!looksLikeOption)
                {
                    // 裸路径参数：GUI 模式预填游戏目录
                    if (options.Mode == CliMode.Gui && options.Directory.Length == 0)
                    {
                        options.Directory = arg;
                        continue;
                    }
                    return options.Invalid("无法识别的参数：" + arg);
                }

                string name = arg;
                string inlineValue = null;
                int eq = arg.IndexOf('=');
                if (eq > 0)
                {
                    name = arg.Substring(0, eq);
                    inlineValue = arg.Substring(eq + 1);
                }

                switch (name.ToLowerInvariant())
                {
                    case "--help":
                    case "-h":
                    case "-?":
                        options.Mode = CliMode.Help;
                        return options;
                    case "--version":
                    case "-v":
                        options.Mode = CliMode.Version;
                        return options;
                    case "--detect":
                        if (inlineValue != null) return options.Invalid("--detect 不接受参数");
                        if (!options.TrySetMode(CliMode.Detect))
                        {
                            return options.Invalid("只能指定一个操作（--detect/--status/--install/--uninstall）");
                        }
                        continue;
                    case "--status":
                    {
                        string error = options.SetAction(args, ref i, CliMode.Status, inlineValue, name);
                        if (error != null) return options.Invalid(error);
                        continue;
                    }
                    case "--install":
                    {
                        string error = options.SetAction(args, ref i, CliMode.Install, inlineValue, name);
                        if (error != null) return options.Invalid(error);
                        continue;
                    }
                    case "--uninstall":
                    {
                        string error = options.SetAction(args, ref i, CliMode.Uninstall, inlineValue, name);
                        if (error != null) return options.Invalid(error);
                        continue;
                    }
                    case "--game":
                    case "--dir":
                    case "--directory":
                    {
                        string value;
                        if (!TryTakeDirectory(args, ref i, inlineValue, false, out value))
                        {
                            return options.Invalid(name + " 需要一个目录参数");
                        }
                        options.Directory = value;
                        continue;
                    }
                    default:
                        return options.Invalid("无法识别的参数：" + arg);
                }
            }
            return options;
        }

        private CliOptions Invalid(string message)
        {
            Mode = CliMode.Invalid;
            Error = message;
            return this;
        }

        private bool TrySetMode(CliMode mode)
        {
            if (ModeChosen && Mode != mode) return false;
            Mode = mode;
            ModeChosen = true;
            return true;
        }

        private string SetAction(string[] args, ref int index, CliMode mode, string inlineValue, string name)
        {
            if (!TrySetMode(mode))
            {
                return "只能指定一个操作（--detect/--status/--install/--uninstall）";
            }
            string value;
            if (!TryTakeDirectory(args, ref index, inlineValue, true, out value))
            {
                return name + " 需要一个目录参数，例如：" + name + " \"D:\\Steam\\steamapps\\common\\游郭惊梦\"";
            }
            Directory = value;
            return null;
        }

        private static bool TryTakeDirectory(string[] args, ref int index, string inlineValue,
            bool optional, out string value)
        {
            if (inlineValue != null)
            {
                value = inlineValue;
                return true;
            }
            if (index + 1 < args.Length)
            {
                string next = args[index + 1];
                bool nextIsOption = next.StartsWith("--", StringComparison.Ordinal) ||
                                    (next.StartsWith("-", StringComparison.Ordinal) && next.Length > 1 &&
                                     !char.IsDigit(next[1]) && next[1] != '\\' && next[1] != '/');
                if (!nextIsOption)
                {
                    index++;
                    value = next;
                    return true;
                }
            }
            value = "";
            return optional;
        }
    }

    internal static class Program
    {
        public const string DisplayName = "游郭惊梦 无障碍补丁安装器";

        [STAThread]
        private static int Main(string[] args)
        {
            Native.EnableDpiAwareness();

            CliOptions options = CliOptions.Parse(args);
            if (options.Mode == CliMode.Gui)
            {
                return RunGui(options.Directory);
            }

            Native.EnsureConsoleStreams();
            return CliRunner.Run(options);
        }

        private static int RunGui(string initialDirectory)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object sender, System.Threading.ThreadExceptionEventArgs e)
            {
                DiagnosticsLog.Append("GUI 未处理异常：" + e.Exception);
                MessageBox.Show(
                    "发生未预期的错误：\n\n" + e.Exception.Message +
                    "\n\n日志文件：" + DiagnosticsLog.Path,
                    DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            };

            DiagnosticsLog.StartSession();
            try
            {
                Application.Run(new MainForm(initialDirectory));
                return 0;
            }
            catch (Exception ex)
            {
                DiagnosticsLog.Append("GUI 启动失败：" + ex);
                MessageBox.Show(
                    "安装器启动失败：\n\n" + ex.Message +
                    "\n\n日志文件：" + DiagnosticsLog.Path,
                    DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 3;
            }
        }

        public static string ExeVersionText()
        {
            try
            {
                Version version = Assembly.GetExecutingAssembly().GetName().Version;
                if (version != null) return version.ToString(3);
            }
            catch { }
            return "0.1.0";
        }

        public static string ExePath()
        {
            try
            {
                string location = Assembly.GetExecutingAssembly().Location;
                if (!string.IsNullOrEmpty(location)) return location;
            }
            catch { }
            return Path.Combine(PatchSource.ExeDirectory(), "install-youguo-a11y.exe");
        }
    }

    internal static class CliRunner
    {
        private const string Prefix = "[installer]";

        public static int Run(CliOptions options)
        {
            if (options.Mode == CliMode.Invalid)
            {
                Console.Error.WriteLine(Prefix + " ERROR: " + options.Error);
                Console.Error.WriteLine();
                WriteUsage();
                return 2;
            }
            if (options.Mode == CliMode.Help)
            {
                WriteUsage();
                return 0;
            }
            if (options.Mode == CliMode.Version)
            {
                PrintVersion();
                return 0;
            }

            Console.WriteLine("== " + Program.DisplayName + "（CLI 自测模式）==");
            Console.WriteLine();

            switch (options.Mode)
            {
                case CliMode.Detect:
                    return Execute("detect", delegate { RunDetect(); });
                case CliMode.Status:
                    return Execute("status", delegate { RunStatus(options.Directory); });
                case CliMode.Install:
                    return Execute("install", delegate { RunInstall(options.Directory); });
                case CliMode.Uninstall:
                    return Execute("uninstall", delegate { RunUninstall(options.Directory); });
            }
            WriteUsage();
            return 2;
        }

        private static int Execute(string prefix, Action body)
        {
            try
            {
                body();
                Console.WriteLine("[" + prefix + "] result: success");
                return 0;
            }
            catch (InstallerException ex)
            {
                Console.Error.WriteLine("[" + prefix + "] ERROR: " + ex.Message);
                Console.WriteLine("[" + prefix + "] result: failed");
                return 2;
            }
            catch (UnauthorizedAccessException ex)
            {
                Console.Error.WriteLine("[" + prefix + "] ERROR: 没有权限访问目标文件/目录：" + ex.Message +
                    "\n\n请检查游戏目录权限，或把游戏目录放在普通用户可写的路径下。");
                Console.WriteLine("[" + prefix + "] result: failed");
                return 2;
            }
            catch (IOException ex)
            {
                Console.Error.WriteLine("[" + prefix + "] ERROR: 文件操作失败：" + ex.Message);
                Console.WriteLine("[" + prefix + "] result: failed");
                return 3;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[" + prefix + "] FATAL: " + ex.ToString());
                Console.WriteLine("[" + prefix + "] result: failed");
                return 3;
            }
        }

        // ------------------------------------------------------------ detect

        private static void RunDetect()
        {
            PatchSource source = PatchSource.TryFind();
            if (source != null)
            {
                Console.WriteLine("[detect] 补丁版本：" + source.Version + "（源：" + source.Root + "）");
            }
            else
            {
                Console.WriteLine("[detect] 补丁版本：未找到（EXE 同目录缺少 a11y-patch\\a11y-boot.js）");
            }

            List<string> hits = SteamLocator.FindGameDirs();
            if (hits.Count == 0)
            {
                throw new InstallerException(
                    "未能自动找到《游郭惊梦》安装目录（Steam 库可能不在默认位置）。\n\n" +
                    "请显式指定游戏根文件夹（包含 Kaede.exe），例如：\n" +
                    "D:\\Steam\\steamapps\\common\\游郭惊梦");
            }

            Console.WriteLine("[detect] 找到游戏目录（" + hits.Count + " 个）：");
            for (int i = 0; i < hits.Count; i++)
            {
                Console.WriteLine("[detect]   [" + (i + 1) + "] " + hits[i]);
            }

            string chosen = hits[0];
            GameInstall game = GameInstall.Resolve(chosen);
            Console.WriteLine("[detect] 游戏目录：" + game.GameRoot);
            Console.WriteLine("[detect] game: " + game.GameRoot);
            Console.WriteLine("[detect] App 目录：" + game.AppDir);
            Console.WriteLine("[detect] app: " + game.AppDir);
        }

        // ------------------------------------------------------------ status

        private static void RunStatus(string directory)
        {
            GameInstall game = GameInstall.ResolveOrAuto(directory);
            InstallState state = InstallerEngine.GetState(game);
            PatchSource source = PatchSource.TryFind();

            Console.WriteLine("[status] 游戏目录：" + game.GameRoot);
            Console.WriteLine("[status] App 目录：" + game.AppDir);
            if (source != null)
            {
                Console.WriteLine("[status] 安装器补丁版本：" + source.Version);
            }
            else
            {
                Console.WriteLine("[status] 安装器补丁版本：未找到 a11y-patch");
            }

            Console.WriteLine("[status] 安装状态：" + state.StatusText);
            if (!string.IsNullOrEmpty(state.Version))
            {
                Console.WriteLine("[status] version: " + state.Version);
            }
            Console.WriteLine("[status] state: " + StateToken(state.Kind));

            if (state.IndexExists)
            {
                try
                {
                    Console.WriteLine("[status] index.html SHA256：" + InstallerEngine.Sha256File(game.IndexPath));
                }
                catch { }
            }
            if (state.Kind == InstallStateKind.Installed || state.Kind == InstallStateKind.Broken)
            {
                Console.WriteLine("[status] index.html 注入标记：" + state.MarkerCount + " 处；" +
                                  "备份：" + (state.BackupExists ? "存在" : "缺失") + "；" +
                                  "补丁目录：" + (state.PatchDirExists ? "存在" : "缺失"));
                if (state.ManifestExists)
                {
                    Console.WriteLine("[status] 清单版本：" +
                                      (string.IsNullOrEmpty(state.ManifestVersion) ? "未知" : state.ManifestVersion) +
                                      "；安装时间：" + state.ManifestInstalledAt);
                }
            }
        }

        private static string StateToken(InstallStateKind kind)
        {
            switch (kind)
            {
                case InstallStateKind.Installed: return "installed";
                case InstallStateKind.NotInstalled: return "not-installed";
                case InstallStateKind.Broken: return "broken";
                default: return "dir-invalid";
            }
        }

        // ------------------------------------------------------------ install

        private static void RunInstall(string directory)
        {
            GameInstall game = GameInstall.ResolveOrAuto(directory);
            PatchSource source = PatchSource.Find();
            int running = InstallerEngine.CountRunningGameProcesses();
            if (running > 0)
            {
                throw new InstallerException(
                    "游戏正在运行（检测到 " + running + " 个 Kaede 进程）。\n\n" +
                    "请先完全退出游戏（关闭游戏窗口；必要时在任务管理器结束 Kaede.exe），然后重试。");
            }

            Console.WriteLine("[install] 游戏目录：" + game.GameRoot);
            Console.WriteLine("[install] App 目录：" + game.AppDir);
            Console.WriteLine("[install] 补丁源：" + source.Root + "（版本 " + source.Version + "）");

            OperationReport report = InstallerEngine.Install(game, source);
            foreach (string line in report.Lines)
            {
                Console.WriteLine("[install] " + line);
            }
            Console.WriteLine("[install] version: " + report.Version);
            Console.WriteLine("[install] marker-count: " + report.MarkerCount);
            Console.WriteLine("[install] index-hash: " + report.IndexHash);
            Console.WriteLine("[install] app-dir: " + report.AppDir);
        }

        // ------------------------------------------------------------ uninstall

        private static void RunUninstall(string directory)
        {
            GameInstall game = GameInstall.ResolveOrAuto(directory);
            int running = InstallerEngine.CountRunningGameProcesses();
            if (running > 0)
            {
                throw new InstallerException(
                    "游戏正在运行（检测到 " + running + " 个 Kaede 进程）。\n\n" +
                    "请先完全退出游戏（关闭游戏窗口；必要时在任务管理器结束 Kaede.exe），然后重试。");
            }

            Console.WriteLine("[uninstall] 游戏目录：" + game.GameRoot);
            Console.WriteLine("[uninstall] App 目录：" + game.AppDir);

            OperationReport report = InstallerEngine.Uninstall(game);
            foreach (string line in report.Lines)
            {
                Console.WriteLine("[uninstall] " + line);
            }
            Console.WriteLine("[uninstall] changed: " + (report.Changed ? "true" : "false"));
            if (report.Changed)
            {
                Console.WriteLine("[uninstall] restored-index-hash: " + report.IndexHash);
            }
            Console.WriteLine("[uninstall] state: not-installed");
        }

        // ------------------------------------------------------------ version/usage

        private static void PrintVersion()
        {
            Console.WriteLine(Program.DisplayName);
            Console.WriteLine("EXE 版本：" + Program.ExeVersionText());
            Console.WriteLine("EXE 路径：" + Program.ExePath());
            PatchSource source = PatchSource.TryFind();
            Console.WriteLine("补丁版本：" +
                (source == null ? "未找到 a11y-patch" : source.Version + "（" + source.Root + "）"));
            Console.WriteLine("目标游戏：《游郭惊梦》（Steam appid " + SteamLocator.GameAppId + "）");
        }

        private static void WriteUsage()
        {
            Console.WriteLine(Program.DisplayName + "  (CLI 自测模式)");
            Console.WriteLine();
            Console.WriteLine("用法：");
            Console.WriteLine("  install-youguo-a11y.exe                          启动图形界面");
            Console.WriteLine("  install-youguo-a11y.exe \"<游戏目录>\"              启动图形界面并预填目录");
            Console.WriteLine("  install-youguo-a11y.exe --detect                 自动检测游戏目录");
            Console.WriteLine("  install-youguo-a11y.exe --status [<游戏目录>]    查看安装状态");
            Console.WriteLine("  install-youguo-a11y.exe --install [<游戏目录>]   安装补丁");
            Console.WriteLine("  install-youguo-a11y.exe --uninstall [<游戏目录>] 卸载补丁");
            Console.WriteLine("  install-youguo-a11y.exe --version                显示版本");
            Console.WriteLine("  install-youguo-a11y.exe --help                   显示本帮助");
            Console.WriteLine();
            Console.WriteLine("游戏目录可以是游戏根目录（含 Kaede.exe，例如 D:\\Steam\\steamapps\\common\\游郭惊梦），");
            Console.WriteLine("也可以直接是 <游戏目录>\\resources\\app；省略时自动在 Steam 库中查找。");
            Console.WriteLine();
            Console.WriteLine("退出码：0=成功；2=可修复错误（参数/目录/状态，含“已安装”“游戏运行中”）；3=意外错误。");
            Console.WriteLine("补丁源：EXE 同目录的 a11y-patch\\ 文件夹（与发布包同级）。");
        }
    }
}
