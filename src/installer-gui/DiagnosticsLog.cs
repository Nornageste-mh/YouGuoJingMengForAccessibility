// 游郭惊梦 无障碍补丁安装器 —— 轻量日志文件（诊断用，失败时告诉用户日志位置）
using System;
using System.IO;
using System.Text;

namespace YouguoInstaller
{
    internal static class DiagnosticsLog
    {
        private static readonly object Sync = new object();
        private static string _path;

        public static string Path
        {
            get
            {
                if (_path == null)
                {
                    _path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "youguo-a11y-installer.log");
                }
                return _path;
            }
        }

        public static void StartSession()
        {
            try
            {
                FileInfo info = new FileInfo(Path);
                if (info.Exists && info.Length > 1024 * 1024) File.Delete(Path);
            }
            catch { }
            Append("=== 安装器启动：" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " ===");
        }

        public static void Append(string line)
        {
            try
            {
                lock (Sync)
                {
                    File.AppendAllText(Path,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + line + Environment.NewLine,
                        new UTF8Encoding(false));
                }
            }
            catch { }
        }
    }
}
