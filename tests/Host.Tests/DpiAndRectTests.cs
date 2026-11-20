using NekoScape.Host.Bridge;
using NekoScape.Host.Native;
using Xunit;

namespace NekoScape.Host.Tests;

public sealed class DpiAndRectTests
{
    [Theory]
    [InlineData(1.0, 48, 72, 168, 192, 0, 0, 48.0, 72.0, 120.0, 120.0)]
    [InlineData(1.25, 100, 150, 200, 250, 0, 0, 80.0, 120.0, 80.0, 80.0)]
    [InlineData(1.5, 48, 72, 168, 192, 0, 0, 32.0, 48.0, 80.0, 80.0)]
    [InlineData(2.0, 64, 96, 214, 246, 0, 0, 32.0, 48.0, 75.0, 75.0)]
    [InlineData(1.5, -1872, 72, -1752, 192, -1920, 0, 32.0, 48.0, 80.0, 80.0)]
    public void ToLogicalRect_MapsPhysicalCoordinatesAndOffsetsAccurately(
        double dpiScale,
        int left,
        int top,
        int right,
        int bottom,
        double originX,
        double originY,
        double expectedX,
        double expectedY,
        double expectedWidth,
        double expectedHeight)
    {
        var phys = new Win32Api.RECT(left, top, right, bottom);
        RectDto logical = DpiCoordinateMapper.ToLogicalRect(phys, originX, originY, dpiScale);

        Assert.Equal(expectedX, logical.X, precision: 4);
        Assert.Equal(expectedY, logical.Y, precision: 4);
        Assert.Equal(expectedWidth, logical.Width, precision: 4);
        Assert.Equal(expectedHeight, logical.Height, precision: 4);
    }

    [Fact]
    public void ToLogicalPoint_AccountsForOriginAndDpiScale()
    {
        (double x, double y) = DpiCoordinateMapper.ToLogicalPoint(
            physX: -960,
            physY: 540,
            originX: -1920,
            originY: 0,
            dpiScale: 1.5);

        Assert.Equal(640.0, x, precision: 4);
        Assert.Equal(360.0, y, precision: 4);
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(-1.0)]
    [InlineData(double.NaN)]
    public void ToLogicalRect_ThrowsOnInvalidDpiScale(double badScale)
    {
        var rect = new Win32Api.RECT(0, 0, 100, 100);
        Assert.Throws<ArgumentOutOfRangeException>(() => DpiCoordinateMapper.ToLogicalRect(rect, 0, 0, badScale));
        Assert.Throws<ArgumentOutOfRangeException>(() => DpiCoordinateMapper.ToLogicalPoint(10, 10, 0, 0, badScale));
    }

    [Theory]
    [InlineData("Recycle Bin", null, true)]
    [InlineData("recycle bin", null, true)]
    [InlineData("回收站", "回收站", true)]
    [InlineData("Trash", null, true)]
    [InlineData("Projects", "回收站", false)]
    [InlineData("", "Recycle Bin", false)]
    public void IsRecycleBinLabel_IdentifiesDefaultAndLocalizedNames(
        string label,
        string? localizedName,
        bool expected)
    {
        Assert.Equal(expected, SysListViewReader.IsRecycleBinLabel(label, localizedName));
    }
}
