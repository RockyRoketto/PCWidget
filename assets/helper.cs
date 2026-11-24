using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;

// Помощник: раз в секунду печатает датчики CPU/GPU одной строкой.
// Записи через табуляцию, поля через '|': тип железа|тип датчика|имя|значение.
// Собирается штатным csc.exe (только C# 5: без $"", ?., => в членах, out var).
static class Helper
{
    static void Visit(IHardware hw, StringBuilder sb)
    {
        try { hw.Update(); } catch { }
        string ht = hw.HardwareType.ToString();
        bool want = ht == "Cpu" || ht.StartsWith("Gpu");
        if (want)
        {
            foreach (ISensor s in hw.Sensors)
            {
                if (!s.Value.HasValue) continue;
                string st = s.SensorType.ToString();
                if (st != "Temperature" && st != "Clock" && st != "Power" && st != "Load" && st != "SmallData" && st != "Fan") continue;
                float v = s.Value.Value;
                if (float.IsNaN(v) || float.IsInfinity(v)) continue;
                if (sb.Length > 0) sb.Append('\t');
                sb.Append(ht).Append('|').Append(st).Append('|').Append(s.Name.Replace('|', '/').Replace('\t', ' ')).Append('|')
                  .Append(v.ToString("0.##", CultureInfo.InvariantCulture));
            }
        }
        foreach (IHardware sub in hw.SubHardware) Visit(sub, sb);
    }

    static void Main()
    {
        // Родитель умер и stdin закрылся: выходим сами.
        Thread watcher = new Thread(delegate ()
        {
            try { while (Console.In.Read() >= 0) { } } catch { }
            Environment.Exit(0);
        });
        watcher.IsBackground = true;
        watcher.Start();

        Computer c = new Computer();
        c.IsCpuEnabled = true;
        c.IsGpuEnabled = true;
        try { c.Open(); }
        catch (Exception e)
        {
            Console.Error.WriteLine("open failed: " + e.Message);
            Environment.Exit(2);
        }

        while (true)
        {
            StringBuilder sb = new StringBuilder();
            try { foreach (IHardware hw in c.Hardware) Visit(hw, sb); }
            catch (Exception e) { Console.Error.WriteLine("read failed: " + e.Message); }
            Console.Out.WriteLine(sb.ToString());
            Console.Out.Flush();
            Thread.Sleep(1000);
        }
    }
}
