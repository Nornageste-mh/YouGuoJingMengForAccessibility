// 游郭惊梦 无障碍补丁安装器 —— WinForms 图形界面
// 无障碍要点：标准控件 + AccessibleName/AccessibleDescription、清晰的 Tab 顺序、
// 尽量大的日志文本域、所有操作结果都有对话框与日志双重反馈（便于 NVDA 朗读）。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace YouguoInstaller
{
    internal sealed class MainForm : Form
    {
        private readonly string _initialDirectory;

        private TextBox _txtGameDir;
        private TextBox _txtLog;
        private Button _btnBrowse;
        private Button _btnDetect;
        private Button _btnInstall;
        private Button _btnUninstall;
        private Button _btnRefresh;
        private Button _btnExit;
        private Label _lblSubtitle;
        private Label _lblStatusTitle;
        private Label _lblStatusDetail;
        private Label _lblNvda;
        private Label _lblFooter;
        private Timer _nvdaTimer;
        private bool _busy;

        public MainForm(string initialDirectory)
        {
            _initialDirectory = initialDirectory == null ? "" : initialDirectory.Trim();
            BuildWindow();
            BuildUi();
            WireEvents();
        }

        // ------------------------------------------------------------ 构建界面

        private void BuildWindow()
        {
            Text = Program.DisplayName;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(720, 640);
            MinimumSize = new Size(680, 580);
            AutoScaleMode = AutoScaleMode.Dpi;
            try { Font = new Font("Microsoft YaHei UI", 9F); }
            catch { }
        }

        private void BuildUi()
        {
            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.Padding = new Padding(14, 12, 14, 8);
            root.ColumnCount = 1;
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            root.RowCount = 8;
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // 标题
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // 副标题
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 96F)); // 游戏目录
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 100F)); // 安装状态
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52F));  // 操作按钮
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // NVDA
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F)); // 日志
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));   // 底部状态
            Controls.Add(root);

            Label title = new Label();
            title.Text = Program.DisplayName;
            title.Font = new Font(Font.FontFamily, 15F, FontStyle.Bold);
            title.AutoSize = true;
            title.Margin = new Padding(0, 0, 0, 2);
            title.AccessibleName = "程序标题：" + title.Text;
            root.Controls.Add(title, 0, 0);

            _lblSubtitle = new Label();
            _lblSubtitle.AutoSize = true;
            _lblSubtitle.ForeColor = Color.DimGray;
            _lblSubtitle.Margin = new Padding(0, 0, 0, 10);
            _lblSubtitle.AccessibleName = "版本信息";
            root.Controls.Add(_lblSubtitle, 0, 1);

            root.Controls.Add(BuildGameGroup(), 0, 2);
            root.Controls.Add(BuildStatusGroup(), 0, 3);
            root.Controls.Add(BuildButtonRow(), 0, 4);

            _lblNvda = new Label();
            _lblNvda.AutoSize = true;
            _lblNvda.Margin = new Padding(0, 2, 0, 8);
            _lblNvda.AccessibleName = "屏幕阅读器状态";
            root.Controls.Add(_lblNvda, 0, 5);

            root.Controls.Add(BuildLogGroup(), 0, 6);

            _lblFooter = new Label();
            _lblFooter.Dock = DockStyle.Fill;
            _lblFooter.Text = "就绪。";
            _lblFooter.ForeColor = Color.DimGray;
            _lblFooter.TextAlign = ContentAlignment.MiddleLeft;
            _lblFooter.Margin = new Padding(0, 6, 0, 0);
            _lblFooter.AccessibleName = "程序状态";
            root.Controls.Add(_lblFooter, 0, 7);
        }

        private GroupBox BuildGameGroup()
        {
            GroupBox group = new GroupBox();
            group.Text = "游戏目录";
            group.Dock = DockStyle.Fill;
            group.Margin = new Padding(0, 0, 0, 8);
            group.Padding = new Padding(10, 8, 10, 10);
            group.AccessibleName = "游戏目录";

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 3;
            layout.RowCount = 1;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

            _txtGameDir = new TextBox();
            _txtGameDir.Dock = DockStyle.Fill;
            _txtGameDir.Margin = new Padding(0, 6, 8, 6);
            _txtGameDir.TabIndex = 0;
            _txtGameDir.AccessibleName = "游戏目录路径";
            _txtGameDir.AccessibleDescription =
                "《游郭惊梦》游戏根目录（包含 Kaede.exe）或其中 resources\\app 目录的完整路径。";
            layout.Controls.Add(_txtGameDir, 0, 0);

            _btnBrowse = MakeButton("浏览…", 92);
            _btnBrowse.Margin = new Padding(0, 4, 8, 4);
            _btnBrowse.TabIndex = 1;
            _btnBrowse.AccessibleName = "浏览游戏目录";
            _btnBrowse.AccessibleDescription = "打开文件夹选择对话框，选择《游郭惊梦》游戏根文件夹。";
            layout.Controls.Add(_btnBrowse, 1, 0);

            _btnDetect = MakeButton("自动检测", 92);
            _btnDetect.Margin = new Padding(0, 4, 0, 4);
            _btnDetect.TabIndex = 2;
            _btnDetect.AccessibleName = "自动检测游戏目录";
            _btnDetect.AccessibleDescription = "通过 Steam 注册表与库配置自动查找《游郭惊梦》安装目录。";
            layout.Controls.Add(_btnDetect, 2, 0);

            group.Controls.Add(layout);
            return group;
        }

        private GroupBox BuildStatusGroup()
        {
            GroupBox group = new GroupBox();
            group.Text = "安装状态";
            group.Dock = DockStyle.Fill;
            group.Margin = new Padding(0, 0, 0, 8);
            group.Padding = new Padding(10, 6, 10, 8);
            group.AccessibleName = "安装状态";

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 1;
            layout.RowCount = 2;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

            _lblStatusTitle = new Label();
            _lblStatusTitle.AutoSize = true;
            _lblStatusTitle.Font = new Font(Font.FontFamily, 12F, FontStyle.Bold);
            _lblStatusTitle.Margin = new Padding(0, 2, 0, 2);
            _lblStatusTitle.Text = "未检测到游戏目录";
            _lblStatusTitle.AccessibleName = "安装状态";
            layout.Controls.Add(_lblStatusTitle, 0, 0);

            _lblStatusDetail = new Label();
            _lblStatusDetail.Dock = DockStyle.Fill;
            _lblStatusDetail.ForeColor = Color.DimGray;
            _lblStatusDetail.Text = "请先选择游戏目录。";
            _lblStatusDetail.AccessibleName = "状态详情";
            layout.Controls.Add(_lblStatusDetail, 0, 1);

            group.Controls.Add(layout);
            return group;
        }

        private TableLayoutPanel BuildButtonRow()
        {
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 4;
            layout.RowCount = 1;
            layout.Margin = new Padding(0, 0, 0, 8);
            for (int i = 0; i < 4; i++)
            {
                layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25F));
            }
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

            _btnInstall = MakeButton("安装补丁", 0);
            _btnInstall.Dock = DockStyle.Fill;
            _btnInstall.Margin = new Padding(2, 4, 2, 4);
            _btnInstall.Font = new Font(Font, FontStyle.Bold);
            _btnInstall.TabIndex = 3;
            _btnInstall.AccessibleName = "安装补丁";
            _btnInstall.AccessibleDescription = "把无障碍补丁安装到游戏（会先备份 index.html）。";
            layout.Controls.Add(_btnInstall, 0, 0);

            _btnUninstall = MakeButton("卸载补丁", 0);
            _btnUninstall.Dock = DockStyle.Fill;
            _btnUninstall.Margin = new Padding(2, 4, 2, 4);
            _btnUninstall.TabIndex = 4;
            _btnUninstall.AccessibleName = "卸载补丁";
            _btnUninstall.AccessibleDescription = "从游戏移除无障碍补丁，并还原安装前的 index.html。";
            layout.Controls.Add(_btnUninstall, 1, 0);

            _btnRefresh = MakeButton("刷新状态", 0);
            _btnRefresh.Dock = DockStyle.Fill;
            _btnRefresh.Margin = new Padding(2, 4, 2, 4);
            _btnRefresh.TabIndex = 5;
            _btnRefresh.AccessibleName = "刷新状态";
            _btnRefresh.AccessibleDescription = "重新读取游戏目录，刷新安装状态。";
            layout.Controls.Add(_btnRefresh, 2, 0);

            _btnExit = MakeButton("退出", 0);
            _btnExit.Dock = DockStyle.Fill;
            _btnExit.Margin = new Padding(2, 4, 2, 4);
            _btnExit.TabIndex = 6;
            _btnExit.AccessibleName = "退出安装器";
            layout.Controls.Add(_btnExit, 3, 0);

            return layout;
        }

        private GroupBox BuildLogGroup()
        {
            GroupBox group = new GroupBox();
            group.Text = "操作日志";
            group.Dock = DockStyle.Fill;
            group.Padding = new Padding(8, 6, 8, 8);
            group.AccessibleName = "操作日志";

            _txtLog = new TextBox();
            _txtLog.Dock = DockStyle.Fill;
            _txtLog.Multiline = true;
            _txtLog.ReadOnly = true;
            _txtLog.ScrollBars = ScrollBars.Vertical;
            _txtLog.WordWrap = true;
            _txtLog.BackColor = Color.White;
            _txtLog.BorderStyle = BorderStyle.FixedSingle;
            _txtLog.TabIndex = 7;
            _txtLog.AccessibleName = "操作日志文本";
            _txtLog.AccessibleDescription = "安装、卸载、检测的详细日志，可用方向键阅读。";
            group.Controls.Add(_txtLog);
            return group;
        }

        private static Button MakeButton(string text, int width)
        {
            Button button = new Button();
            button.Text = text;
            button.AutoSize = false;
            if (width > 0) button.Width = width;
            button.Height = 30;
            button.UseVisualStyleBackColor = true;
            return button;
        }

        private void WireEvents()
        {
            _btnBrowse.Click += delegate { HandleBrowse(); };
            _btnDetect.Click += delegate { HandleAutoDetect(); };
            _btnInstall.Click += delegate { HandleInstall(); };
            _btnUninstall.Click += delegate { HandleUninstall(); };
            _btnRefresh.Click += delegate { UpdateSubtitle(); UpdateStatus(); RefreshNvdaStatus(); AppendLog("已刷新状态。"); };
            _btnExit.Click += delegate { Close(); };

            _txtGameDir.Validated += delegate { UpdateStatus(); };
            _txtGameDir.KeyDown += delegate(object sender, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    UpdateStatus();
                }
            };

            CancelButton = _btnExit;

            _nvdaTimer = new Timer();
            _nvdaTimer.Interval = 3000;
            _nvdaTimer.Tick += delegate { RefreshNvdaStatus(); };
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            if (_initialDirectory.Length > 0)
            {
                _txtGameDir.Text = _initialDirectory;
                AppendLog("已载入命令行指定的游戏目录。");
                UpdateStatus();
            }
            else
            {
                AutoDetectSilently();
            }
            UpdateSubtitle();
            RefreshNvdaStatus();
            _nvdaTimer.Start();
            _lblFooter.Text = "就绪。安装或卸载前请先完全退出游戏。";
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            if (_nvdaTimer != null)
            {
                _nvdaTimer.Stop();
                _nvdaTimer.Dispose();
            }
        }

        // ------------------------------------------------------------ 状态刷新

        private void UpdateSubtitle()
        {
            PatchSource source = PatchSource.TryFind();
            string patchText = source == null
                ? "补丁版本：未找到（EXE 同目录缺少 a11y-patch）"
                : "补丁版本：" + source.Version;
            _lblSubtitle.Text = "NVDA 无障碍补丁 · " + patchText + " · 安装器版本 " + Program.ExeVersionText();
        }

        private void RefreshNvdaStatus()
        {
            bool running = IsNvdaRunning();
            if (running)
            {
                _lblNvda.Text = "屏幕阅读器：NVDA 正在运行。";
                _lblNvda.ForeColor = Color.ForestGreen;
            }
            else
            {
                _lblNvda.Text = "屏幕阅读器：未检测到 NVDA。本补丁需要 NVDA 才能朗读，请先启动 NVDA。";
                _lblNvda.ForeColor = Color.SaddleBrown;
            }
        }

        private static bool IsNvdaRunning()
        {
            try
            {
                Process[] processes = Process.GetProcessesByName("nvda");
                return processes.Length > 0;
            }
            catch { return false; }
        }

        private void UpdateStatus()
        {
            if (_busy) return;

            string dir = _txtGameDir.Text.Trim();
            if (dir.Length == 0)
            {
                SetStatus("未选择游戏目录",
                    "请点击「自动检测」或「浏览…」选择游戏目录（游戏根目录或 resources\\app）。",
                    Color.DimGray);
                _btnInstall.Enabled = false;
                _btnUninstall.Enabled = false;
                return;
            }

            GameInstall game;
            try
            {
                game = GameInstall.Resolve(dir);
            }
            catch (InstallerException ex)
            {
                SetStatus("目录无效", FirstLine(ex.Message), Color.Firebrick);
                _btnInstall.Enabled = false;
                _btnUninstall.Enabled = false;
                return;
            }

            InstallState state = InstallerEngine.GetState(game);
            string detail = "App 目录：" + game.AppDir +
                            "\n原始备份：" + (state.BackupExists ? "存在" : "缺失") +
                            " · 补丁目录：" + (state.PatchDirExists ? "存在" : "缺失") +
                            " · index.html 标记：" + state.MarkerCount + " 处";

            switch (state.Kind)
            {
                case InstallStateKind.NotInstalled:
                    SetStatus("未安装", detail, Color.DimGray);
                    _btnInstall.Enabled = true;
                    _btnUninstall.Enabled = false;
                    break;
                case InstallStateKind.Installed:
                    if (!string.IsNullOrEmpty(state.ManifestInstalledAt))
                    {
                        detail += "\n安装时间：" + state.ManifestInstalledAt;
                    }
                    SetStatus(state.StatusText, detail, Color.ForestGreen);
                    _btnInstall.Enabled = false;
                    _btnUninstall.Enabled = true;
                    break;
                case InstallStateKind.Broken:
                    SetStatus("安装异常，需要人工处理", state.StatusText + "\n" + detail, Color.DarkOrange);
                    _btnInstall.Enabled = true;
                    _btnUninstall.Enabled = true;
                    break;
                default:
                    SetStatus("目录无效", detail, Color.Firebrick);
                    _btnInstall.Enabled = false;
                    _btnUninstall.Enabled = false;
                    break;
            }
        }

        private void SetStatus(string title, string detail, Color color)
        {
            _lblStatusTitle.Text = title;
            _lblStatusTitle.ForeColor = color;
            _lblStatusDetail.Text = detail.Replace("\n", "；");
        }

        private static string FirstLine(string text)
        {
            if (text == null) return "";
            int index = text.IndexOf('\n');
            if (index < 0) return text;
            return text.Substring(0, index).TrimEnd('\r');
        }

        private void SetBusy(bool busy)
        {
            _busy = busy;
            _btnInstall.Enabled = !busy;
            _btnUninstall.Enabled = !busy;
            _btnBrowse.Enabled = !busy;
            _btnDetect.Enabled = !busy;
            _btnRefresh.Enabled = !busy;
            _btnExit.Enabled = !busy;
            Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
            if (busy)
            {
                _lblFooter.Text = "正在处理，请稍候…";
                _lblFooter.ForeColor = Color.SteelBlue;
            }
            else
            {
                _lblFooter.ForeColor = Color.DimGray;
            }
        }

        // ------------------------------------------------------------ 目录选择

        private void AutoDetectSilently()
        {
            try
            {
                List<string> hits = SteamLocator.FindGameDirs();
                if (hits.Count == 0)
                {
                    AppendLog("自动检测：未找到《游郭惊梦》安装目录，请点击「浏览…」手动选择。");
                    UpdateStatus();
                    return;
                }
                _txtGameDir.Text = hits[0];
                AppendLog("自动检测：找到 " + hits.Count + " 个候选，已使用 " + hits[0]);
                UpdateStatus();
            }
            catch (Exception ex)
            {
                AppendLog("自动检测失败：" + ex.Message);
            }
        }

        private void HandleAutoDetect()
        {
            Cursor = Cursors.WaitCursor;
            try
            {
                List<string> hits = SteamLocator.FindGameDirs();
                if (hits.Count == 0)
                {
                    ShowInfo("自动检测",
                        "未能自动找到《游郭惊梦》安装目录（Steam 库可能不在默认位置）。\n\n" +
                        "请点击「浏览…」手动选择游戏根文件夹（包含 Kaede.exe），例如：\n" +
                        "D:\\Steam\\steamapps\\common\\游郭惊梦");
                    return;
                }
                _txtGameDir.Text = hits[0];
                if (hits.Count > 1)
                {
                    AppendLog("自动检测：找到 " + hits.Count + " 个候选：");
                    foreach (string hit in hits) AppendLog("  " + hit);
                    ShowInfo("自动检测",
                        "找到 " + hits.Count + " 个候选目录，已选择第一个：\n\n" + hits[0] +
                        "\n\n如果这不是正确的目录，请点击「浏览…」手动选择。");
                }
                else
                {
                    AppendLog("自动检测：找到游戏目录 " + hits[0]);
                }
                UpdateStatus();
            }
            catch (Exception ex)
            {
                ShowError("自动检测失败：" + ex.Message);
            }
            finally
            {
                Cursor = Cursors.Default;
            }
        }

        private void HandleBrowse()
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "请选择《游郭惊梦》游戏根文件夹（包含 Kaede.exe）";
                dialog.ShowNewFolderButton = false;
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                _txtGameDir.Text = dialog.SelectedPath;
                AppendLog("已选择游戏目录：" + dialog.SelectedPath);
                UpdateStatus();
            }
        }

        // ------------------------------------------------------------ 安装

        private void HandleInstall()
        {
            GameInstall game;
            try
            {
                game = GameInstall.Resolve(_txtGameDir.Text.Trim());
            }
            catch (InstallerException ex)
            {
                ShowError(ex.Message);
                return;
            }

            PatchSource source = PatchSource.TryFind();
            if (source == null)
            {
                ShowError(PatchSource.NotFoundMessage());
                return;
            }

            int running = InstallerEngine.CountRunningGameProcesses();
            if (running > 0)
            {
                ShowInfo("无法安装",
                    "游戏正在运行（检测到 " + running + " 个 Kaede 进程）。\n\n" +
                    "请先完全退出游戏（关闭游戏窗口；必要时在任务管理器结束 Kaede.exe），然后重试。");
                return;
            }

            InstallState state = InstallerEngine.GetState(game);
            if (state.MarkerCount > 0)
            {
                ShowInfo("无法重复安装",
                    "该目录已安装补丁（" + state.StatusText + "）。\n\n" +
                    "如需重装或更新：请先点击「卸载补丁」，再重新安装。\n\n目录：" + game.AppDir);
                return;
            }

            string message = "将把无障碍补丁（版本 " + source.Version + "）安装到：\n\n" +
                             game.AppDir + "\n\n" +
                             "安装前会先备份原始 index.html 为 index.html.a11y-backup，\n" +
                             "之后可随时用本工具卸载并还原原始文件。\n\n是否继续安装？";
            DialogResult answer = MessageBox.Show(this, message, "安装补丁 - 请确认",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes)
            {
                AppendLog("已取消安装。");
                _lblFooter.Text = "已取消安装。";
                return;
            }

            RunInstallCore(game, source);
        }

        private void RunInstallCore(GameInstall game, PatchSource source)
        {
            SetBusy(true);
            try
            {
                AppendLog("开始安装：版本 " + source.Version + " → " + game.AppDir);
                OperationReport report = InstallerEngine.Install(game, source);
                foreach (string line in report.Lines)
                {
                    AppendLog("安装：" + line);
                }
                AppendLog("安装：version=" + report.Version +
                          " marker-count=" + report.MarkerCount +
                          " index-hash=" + report.IndexHash);

                SetBusy(false);
                UpdateStatus();
                RefreshNvdaStatus();
                UpdateSubtitle();

                string message = "安装成功！\n\n补丁版本：" + report.Version +
                                 "\n游戏目录：" + game.AppDir +
                                 "\n\n现在可以启动游戏（需 NVDA 正在运行）。";
                if (!IsNvdaRunning())
                {
                    message += "\n\n注意：当前未检测到 NVDA 正在运行。本补丁需要 NVDA 才能朗读，" +
                               "请先启动 NVDA，再启动游戏。";
                }
                ShowInfo("安装成功", message);
                _lblFooter.Text = "安装完成。";
            }
            catch (InstallerException ex)
            {
                SetBusy(false);
                UpdateStatus();
                ShowError("安装失败：" + ex.Message);
            }
            catch (Exception ex)
            {
                SetBusy(false);
                UpdateStatus();
                ShowError("安装失败（意外错误）：" + ex.Message +
                          "\n\n日志文件：" + DiagnosticsLog.Path);
            }
        }

        // ------------------------------------------------------------ 卸载

        private void HandleUninstall()
        {
            GameInstall game;
            try
            {
                game = GameInstall.Resolve(_txtGameDir.Text.Trim());
            }
            catch (InstallerException ex)
            {
                ShowError(ex.Message);
                return;
            }

            int running = InstallerEngine.CountRunningGameProcesses();
            if (running > 0)
            {
                ShowInfo("无法卸载",
                    "游戏正在运行（检测到 " + running + " 个 Kaede 进程）。\n\n" +
                    "请先完全退出游戏（关闭游戏窗口；必要时在任务管理器结束 Kaede.exe），然后重试。");
                return;
            }

            InstallState state = InstallerEngine.GetState(game);
            if (state.Kind == InstallStateKind.NotInstalled)
            {
                ShowInfo("无需卸载", "未发现已安装的补丁（该目录未安装过，或已卸载）。");
                return;
            }
            if (state.Kind == InstallStateKind.Broken && !state.BackupExists)
            {
                ShowError("无法安全卸载：检测到补丁痕迹，但缺少原始备份 index.html.a11y-backup。\n\n" +
                          "请用 Steam 验证游戏文件完整性（库 → 右键《游郭惊梦》→ 属性 → 本地文件 → " +
                          "验证文件完整性）恢复原始文件，然后手动删除 a11y-patch 目录。\n\n" +
                          "游戏目录：" + game.AppDir);
                return;
            }

            string message = "将卸载无障碍补丁，并把 index.html 还原为安装前的原始版本：" +
                             "\n\n" + game.AppDir + "\n\n" +
                             "卸载会从 index.html.a11y-backup 还原原始文件，并删除 a11y-patch 目录。\n\n是否继续卸载？";
            DialogResult answer = MessageBox.Show(this, message, "卸载补丁 - 请确认",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes)
            {
                AppendLog("已取消卸载。");
                _lblFooter.Text = "已取消卸载。";
                return;
            }

            RunUninstallCore(game);
        }

        private void RunUninstallCore(GameInstall game)
        {
            SetBusy(true);
            try
            {
                AppendLog("开始卸载：" + game.AppDir);
                OperationReport report = InstallerEngine.Uninstall(game);
                foreach (string line in report.Lines)
                {
                    AppendLog("卸载：" + line);
                }

                SetBusy(false);
                UpdateStatus();
                RefreshNvdaStatus();

                if (!report.Changed)
                {
                    ShowInfo("无需卸载", "未发现已安装的补丁。");
                    _lblFooter.Text = "未发现已安装的补丁。";
                    return;
                }

                ShowInfo("卸载完成",
                    "卸载完成！\n\nindex.html 已还原为安装前的原始文件。" +
                    "\n游戏目录：" + game.AppDir +
                    "\n\n可重新启动游戏验证恢复原状。");
                _lblFooter.Text = "卸载完成。";
            }
            catch (InstallerException ex)
            {
                SetBusy(false);
                UpdateStatus();
                ShowError("卸载失败：" + ex.Message);
            }
            catch (Exception ex)
            {
                SetBusy(false);
                UpdateStatus();
                ShowError("卸载失败（意外错误）：" + ex.Message +
                          "\n\n日志文件：" + DiagnosticsLog.Path);
            }
        }

        // ------------------------------------------------------------ 反馈

        private void AppendLog(string message)
        {
            if (message == null) return;
            string flat = message.Replace("\r\n", " / ").Replace("\n", " / ");
            string line = DateTime.Now.ToString("HH:mm:ss") + "  " + flat;
            _txtLog.AppendText(line + Environment.NewLine);
            _txtLog.SelectionStart = _txtLog.TextLength;
            _txtLog.ScrollToCaret();
        }

        private void ShowError(string message)
        {
            AppendLog("错误：" + message);
            MessageBox.Show(this, message, Program.DisplayName + " - 错误",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        private void ShowInfo(string title, string message)
        {
            AppendLog(title + "：" + message);
            MessageBox.Show(this, message, Program.DisplayName + " - " + title,
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
