// 游郭惊梦 无障碍补丁安装器 —— Win32 互操作（控制台桥接 / DPI）
// 说明：本文件为 .NET Framework 4.8 + C# 5 语法（csc.exe v4.0.30319）。
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace YouguoInstaller
{
    /// <summary>
    /// 原生互操作。GUI 子系统的 EXE 默认没有控制台，CLI 自测模式需要把 stdout/stderr
    /// 接到调用方（终端或 PowerShell 管道），否则自动化拿不到输出。
    /// </summary>
    internal static class Native
    {
        private const int STD_OUTPUT_HANDLE = -11;
        private const int STD_ERROR_HANDLE = -12;
        private const int ATTACH_PARENT_PROCESS = -1;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint FILE_SHARE_READ = 0x00000001;
        private const uint FILE_SHARE_WRITE = 0x00000002;
        private const uint OPEN_EXISTING = 3;
        private static readonly IntPtr InvalidHandle = new IntPtr(-1);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AttachConsole(int dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetStdHandle(int nStdHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetStdHandle(int nStdHandle, IntPtr hHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetConsoleMode(IntPtr hConsoleHandle, out int lpMode);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateFileW(
            string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes,
            uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        public static void EnableDpiAwareness()
        {
            try { SetProcessDPIAware(); }
            catch { }
        }

        /// <summary>
        /// 让 CLI 模式有可用的 stdout/stderr。三种情形：
        /// 1) 已被调用方重定向（管道/文件）→ 换成 UTF-8 写入，保证 PowerShell 抓取中文不乱码；
        /// 2) 有控制台父进程 → Attach 到父控制台并设 UTF-8 输出编码；
        /// 3) 两者皆无（双击运行 CLI 参数）→ 不阻塞、输出丢弃（GUI 模式不使用控制台）。
        /// </summary>
        public static void EnsureConsoleStreams()
        {
            IntPtr hOut = GetStdHandle(STD_OUTPUT_HANDLE);

            if (IsConsole(hOut))
            {
                TrySetConsoleEncodingUtf8();
                return;
            }

            if (IsInvalid(hOut))
            {
                try { AttachConsole(ATTACH_PARENT_PROCESS); }
                catch { }
                hOut = GetStdHandle(STD_OUTPUT_HANDLE);
                if (IsConsole(hOut))
                {
                    TrySetConsoleEncodingUtf8();
                    return;
                }
            }

            if (!IsInvalid(hOut))
            {
                // 句柄有效但不是控制台 → 管道/文件重定向；强制 UTF-8（无 BOM）。
                try
                {
                    Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
                    Console.SetError(new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true });
                }
                catch { }
                return;
            }

            // 无任何标准输出句柄：尝试打开当前控制台（若存在），否则静默放弃。
            IntPtr h = IntPtr.Zero;
            try
            {
                h = CreateFileW("CONOUT$", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
                    IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            }
            catch { }

            if (!IsInvalid(h) && h != IntPtr.Zero)
            {
                try
                {
                    SetStdHandle(STD_OUTPUT_HANDLE, h);
                    SetStdHandle(STD_ERROR_HANDLE, h);
                    FileStream stream = new FileStream(new SafeFileHandle(h, false), FileAccess.Write);
                    StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false));
                    writer.AutoFlush = true;
                    Console.SetOut(writer);
                    Console.SetError(writer);
                }
                catch { }
            }
        }

        private static void TrySetConsoleEncodingUtf8()
        {
            try { Console.OutputEncoding = new UTF8Encoding(false); }
            catch { }
        }

        private static bool IsConsole(IntPtr handle)
        {
            if (IsInvalid(handle)) return false;
            int mode;
            try { return GetConsoleMode(handle, out mode); }
            catch { return false; }
        }

        private static bool IsInvalid(IntPtr handle)
        {
            return handle == IntPtr.Zero || handle == InvalidHandle;
        }
    }
}
