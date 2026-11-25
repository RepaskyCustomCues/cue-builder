# Copyright 2026, Michael E. Repasky, Repasky Custom Cues.
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class WoodTextures {
  public static void WriteAll(string dir) {
    Directory.CreateDirectory(dir);
    Save(dir, "maple.png", Maple);
    Save(dir, "curly.png", Curly);
    Save(dir, "birdseye.png", Birdseye);
    Save(dir, "walnut.png", Walnut);
    Save(dir, "cocobolo.png", Cocobolo);
    Save(dir, "ebony.png", Ebony);
    Save(dir, "purpleheart.png", Purpleheart);
    Save(dir, "bocote.png", Bocote);
    Save(dir, "padauk.png", Padauk);
  }

  static void Save(string dir, string name, Func<double, double, Color> paint) {
    const int w = 512;
    const int h = 64;
    using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      var bytes = new byte[w * h * 4];
      for (int y = 0; y < h; y++) {
        double v = (y + 0.5) / h;
        for (int x = 0; x < w; x++) {
          double u = (x + 0.5) / w;
          Color c = paint(u, v);
          int i = (y * w + x) * 4;
          bytes[i] = c.B;
          bytes[i + 1] = c.G;
          bytes[i + 2] = c.R;
          bytes[i + 3] = 255;
        }
      }
      Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
      bmp.UnlockBits(data);
      bmp.Save(Path.Combine(dir, name), ImageFormat.Png);
    }
  }

  static int Mod(int n, int m) {
    int r = n % m;
    return r < 0 ? r + m : r;
  }

  static double Hash(int x, int y) {
    uint n = (uint)(x * 374761393 + y * 668265263);
    n = (n ^ (n >> 13)) * 1274126177u;
    n ^= n >> 16;
    return (n & 0xffffff) / (double)0xffffff;
  }

  static double Noise(double x, double y, int px, int py) {
    int x0 = (int)Math.Floor(x);
    int y0 = (int)Math.Floor(y);
    double fx = x - x0;
    double fy = y - y0;
    double sx = fx * fx * (3 - 2 * fx);
    double sy = fy * fy * (3 - 2 * fy);
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    double a = Hash(Mod(x0, px), Mod(y0, py));
    double b = Hash(Mod(x1, px), Mod(y0, py));
    double c = Hash(Mod(x0, px), Mod(y1, py));
    double d = Hash(Mod(x1, px), Mod(y1, py));
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  static double Fbm(double u, double v, int cu, int cv) {
    double n = 0, amp = 0.5, sum = 0;
    for (int i = 0; i < 4; i++) {
      n += amp * Noise(u * cu, v * cv, cu, cv);
      sum += amp;
      amp *= 0.5;
      cu *= 2;
      cv *= 2;
    }
    return n / sum;
  }

  /* Lines of grain run with u, the length of the cue. v goes around the cue. */
  static double Grain(double u, double v, double lanes, double contrast) {
    double warp = (Fbm(u, v, 3, 5) - 0.5) * 0.15;
    double g = (v + warp) * lanes;
    double frac = g - Math.Floor(g);
    double dist = Math.Abs(frac - 0.5) * 2.0;
    double line = Math.Pow(dist, 0.45);
    double fine = Fbm(u, v, 10, Math.Max(8, (int)lanes * 2));
    double pores = Hash((int)Math.Floor(u * 180), (int)Math.Floor(v * lanes * 4)) > 0.975 ? 0.72 : 1.0;
    double shade = (1.0 - contrast) + contrast * line;
    shade *= 0.9 + 0.1 * fine;
    shade *= pores;
    return shade;
  }

  static Color Mix(int r0, int g0, int b0, int r1, int g1, int b1, double shade) {
    shade = Math.Max(0, Math.Min(1, shade));
    return Color.FromArgb(
      (int)(r1 + (r0 - r1) * shade),
      (int)(g1 + (g0 - g1) * shade),
      (int)(b1 + (b0 - b1) * shade));
  }

  static Color Maple(double u, double v) {
    return Mix(236, 219, 186, 186, 156, 112, Grain(u, v, 22, 0.42));
  }

  static Color Curly(double u, double v) {
    double shade = Grain(u, v, 20, 0.34);
    double band = 0.5 + 0.5 * Math.Sin((u * 14.0 + (Fbm(u, v, 2, 3) - 0.5) * 0.45) * Math.PI * 2);
    shade *= 0.72 + 0.28 * band;
    return Mix(214, 186, 132, 150, 112, 62, shade);
  }

  static Color Birdseye(double u, double v) {
    double shade = Grain(u, v, 18, 0.28);
    const int nx = 9;
    const int ny = 4;
    double su = u * nx;
    double sv = v * ny;
    int ix = (int)Math.Floor(su);
    int iy = (int)Math.Floor(sv);
    double nearest = 99;
    for (int ox = -1; ox <= 1; ox++) {
      for (int oy = -1; oy <= 1; oy++) {
        int cx = ix + ox;
        int cy = iy + oy;
        int mx = Mod(cx, nx);
        int my = Mod(cy, ny);
        double ex = cx + 0.3 + 0.4 * Hash(mx, my);
        double ey = cy + 0.3 + 0.4 * Hash(mx + 7, my + 3);
        double dx = (su - ex) * (12.0 / nx);
        double dy = (sv - ey) * (3.2 / ny);
        double d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
    }
    double eye = Math.Exp(-nearest / (0.09 * 0.09));
    shade *= 1.0 - 0.42 * eye;
    return Mix(240, 224, 194, 176, 142, 96, shade);
  }

  static Color Walnut(double u, double v) {
    return Mix(128, 84, 48, 62, 36, 20, Grain(u, v, 16, 0.5));
  }

  static Color Cocobolo(double u, double v) {
    double shade = Grain(u, v, 9, 0.62);
    return Mix(156, 62, 40, 48, 18, 14, shade);
  }

  static Color Ebony(double u, double v) {
    return Mix(58, 50, 44, 18, 16, 14, Grain(u, v, 14, 0.55));
  }

  static Color Purpleheart(double u, double v) {
    return Mix(142, 62, 118, 78, 32, 64, Grain(u, v, 18, 0.4));
  }

  static Color Bocote(double u, double v) {
    double shade = Grain(u, v, 8, 0.7);
    return Mix(198, 156, 78, 74, 42, 16, shade);
  }

  static Color Padauk(double u, double v) {
    return Mix(196, 78, 40, 120, 36, 22, Grain(u, v, 16, 0.4));
  }
}
"@
[WoodTextures]::WriteAll((Join-Path $PSScriptRoot "."))
Write-Host "wrote woods"
