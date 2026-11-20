using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace NekoScape.Host.Settings;

internal enum ActionGlyph
{
    None,
    Laser,
    Yarn,
    Box,
    Treat,
    Mouse,
    Fish,
    SoundOn,
    SoundOff,
    Kitten,
    Camera,
    Pause,
    Play,
    Window,
    Wallpaper,
    Settings,
    Refresh,
}

internal static class ModernTheme
{
    public static readonly Color SurfaceWindow = Color.FromArgb(24, 18, 15);
    public static readonly Color SurfaceCard = Color.FromArgb(36, 27, 22);
    public static readonly Color SurfaceCardHover = Color.FromArgb(48, 36, 29);
    public static readonly Color SurfaceCardActive = Color.FromArgb(56, 40, 28);
    public static readonly Color SurfaceRecessed = Color.FromArgb(17, 12, 10);
    public static readonly Color BorderOuter = Color.FromArgb(84, 62, 48);
    public static readonly Color BorderSubtle = Color.FromArgb(60, 44, 35);
    public static readonly Color BorderHover = Color.FromArgb(120, 88, 68);
    public static readonly Color Divider = Color.FromArgb(50, 37, 30);
    public static readonly Color AccentHoney = Color.FromArgb(232, 169, 98);
    public static readonly Color AccentHoneyBright = Color.FromArgb(244, 190, 124);
    public static readonly Color AccentCoral = Color.FromArgb(224, 94, 74);
    public static readonly Color AccentSage = Color.FromArgb(124, 186, 134);
    public static readonly Color InkPrimary = Color.FromArgb(247, 239, 228);
    public static readonly Color InkSecondary = Color.FromArgb(196, 176, 156);
    public static readonly Color InkMuted = Color.FromArgb(142, 120, 102);
    public static readonly Color InkDisabled = Color.FromArgb(112, 92, 78);
    public static readonly Color InkOnAccent = Color.FromArgb(30, 20, 13);

    public static GraphicsPath CreateRoundedRect(RectangleF rect, float radius)
    {
        GraphicsPath path = new();
        if (rect.Width <= 0 || rect.Height <= 0)
        {
            return path;
        }

        float d = Math.Min(radius * 2f, Math.Min(rect.Width, rect.Height));
        if (d <= 0.5f)
        {
            path.AddRectangle(rect);
            return path;
        }

        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    public static void ConfigureHighQuality(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
    }

    public static void DrawFocusRing(Graphics g, RectangleF rect, float radius)
    {
        RectangleF focusRect = RectangleF.Inflate(rect, -1f, -1f);
        using GraphicsPath path = CreateRoundedRect(focusRect, Math.Max(2f, radius - 1f));
        using Pen focusPen = new(AccentHoneyBright, 1.5f);
        g.DrawPath(focusPen, path);
    }
}

internal sealed class ModernSegmentedBar : Control
{
    private readonly List<(string Key, string Label)> _items = [];
    private string _selectedKey = string.Empty;
    private int _hoverIndex = -1;
    private readonly bool _isHeaderTab;

    public event Action<string>? SelectionChanged;

    public ModernSegmentedBar(IEnumerable<(string Key, string Label)> items, bool isHeaderTab = false)
    {
        _items.AddRange(items);
        if (_items.Count > 0)
        {
            _selectedKey = _items[0].Key;
        }

        _isHeaderTab = isHeaderTab;
        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        TabStop = true;
        Cursor = Cursors.Hand;
        Height = isHeaderTab ? 34 : 36;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string SelectedKey
    {
        get => _selectedKey;
        set
        {
            string normalized = value ?? string.Empty;
            int idx = _items.FindIndex(item => string.Equals(item.Key, normalized, StringComparison.OrdinalIgnoreCase));
            string resolved = idx >= 0 ? _items[idx].Key : (_items.Count > 0 ? _items[0].Key : string.Empty);
            if (!string.Equals(_selectedKey, resolved, StringComparison.OrdinalIgnoreCase))
            {
                _selectedKey = resolved;
                Invalidate();
            }
        }
    }

    protected override void OnGotFocus(EventArgs e)
    {
        base.OnGotFocus(e);
        Invalidate();
    }

    protected override void OnLostFocus(EventArgs e)
    {
        base.OnLostFocus(e);
        Invalidate();
    }

    protected override bool IsInputKey(Keys keyData)
    {
        if (keyData is Keys.Left or Keys.Right or Keys.Home or Keys.End)
        {
            return true;
        }
        return base.IsInputKey(keyData);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (_items.Count == 0)
        {
            return;
        }

        int currentIdx = _items.FindIndex(item => string.Equals(item.Key, _selectedKey, StringComparison.OrdinalIgnoreCase));
        if (currentIdx < 0)
        {
            currentIdx = 0;
        }

        int nextIdx = e.KeyCode switch
        {
            Keys.Left => (currentIdx - 1 + _items.Count) % _items.Count,
            Keys.Right => (currentIdx + 1) % _items.Count,
            Keys.Home => 0,
            Keys.End => _items.Count - 1,
            _ => -1,
        };

        if (nextIdx >= 0 && nextIdx != currentIdx)
        {
            SelectByIndex(nextIdx);
            e.Handled = true;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        int nextHover = GetIndexAt(e.Location);
        if (nextHover != _hoverIndex)
        {
            _hoverIndex = nextHover;
            Invalidate();
        }
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (_hoverIndex != -1)
        {
            _hoverIndex = -1;
            Invalidate();
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        int idx = GetIndexAt(e.Location);
        if (idx >= 0 && idx < _items.Count)
        {
            SelectByIndex(idx);
        }
    }

    private void SelectByIndex(int idx)
    {
        string key = _items[idx].Key;
        if (!string.Equals(_selectedKey, key, StringComparison.OrdinalIgnoreCase))
        {
            _selectedKey = key;
            Invalidate();
            SelectionChanged?.Invoke(key);
        }
    }

    private int GetIndexAt(Point pt)
    {
        if (_items.Count == 0 || Width <= 6)
        {
            return -1;
        }

        float innerWidth = Width - 6f;
        float segWidth = innerWidth / _items.Count;
        int idx = (int)((pt.X - 3f) / segWidth);
        return idx >= 0 && idx < _items.Count ? idx : -1;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        ModernTheme.ConfigureHighQuality(g);
        g.Clear(Parent?.BackColor ?? ModernTheme.SurfaceWindow);

        RectangleF outerRect = new(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        float outerRadius = _isHeaderTab ? 9f : 10f;

        using (GraphicsPath outerPath = ModernTheme.CreateRoundedRect(outerRect, outerRadius))
        using (SolidBrush trackBrush = new(ModernTheme.SurfaceRecessed))
        using (Pen borderPen = new(ModernTheme.BorderSubtle, 1f))
        {
            g.FillPath(trackBrush, outerPath);
            g.DrawPath(borderPen, outerPath);
        }

        if (_items.Count == 0)
        {
            return;
        }

        float pad = 3f;
        float availW = Width - pad * 2f;
        float segW = availW / _items.Count;
        float segH = Height - pad * 2f;

        using Font activeFont = new("Segoe UI", _isHeaderTab ? 8.75f : 8.75f, FontStyle.Bold, GraphicsUnit.Point);
        using Font normalFont = new("Segoe UI", _isHeaderTab ? 8.75f : 8.75f, FontStyle.Regular, GraphicsUnit.Point);
        using StringFormat sf = new()
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            FormatFlags = StringFormatFlags.NoWrap,
        };

        for (int i = 0; i < _items.Count; i++)
        {
            var (key, label) = _items[i];
            bool isSelected = string.Equals(key, _selectedKey, StringComparison.OrdinalIgnoreCase);
            bool isHovered = i == _hoverIndex && !isSelected;

            RectangleF segRect = new(pad + i * segW, pad, segW, segH);
            if (isSelected)
            {
                using GraphicsPath pillPath = ModernTheme.CreateRoundedRect(segRect, outerRadius - 2.5f);
                using SolidBrush pillBrush = new(ModernTheme.AccentHoney);
                g.FillPath(pillBrush, pillPath);
            }
            else if (isHovered)
            {
                using GraphicsPath hoverPath = ModernTheme.CreateRoundedRect(segRect, outerRadius - 2.5f);
                using SolidBrush hoverBrush = new(ModernTheme.SurfaceCardHover);
                g.FillPath(hoverBrush, hoverPath);
            }

            using SolidBrush textBrush = new(
                isSelected
                    ? ModernTheme.InkOnAccent
                    : (isHovered ? ModernTheme.InkPrimary : ModernTheme.InkSecondary));
            g.DrawString(label, isSelected ? activeFont : normalFont, textBrush, segRect, sf);
        }

        if (Focused && ShowFocusCues)
        {
            ModernTheme.DrawFocusRing(g, outerRect, outerRadius);
        }
    }
}

internal sealed class ModernSceneCard : Control
{
    private readonly string _sceneKey;
    private readonly string _title;
    private readonly string _subtitle;
    private readonly Color _floorColor;
    private readonly Color _rugColor;
    private readonly Color _propAccentColor;
    private bool _selected;
    private bool _hovered;

    public event Action<string>? Clicked;

    public ModernSceneCard(
        string sceneKey,
        string title,
        string subtitle,
        Color floorColor,
        Color rugColor,
        Color propAccentColor)
    {
        _sceneKey = sceneKey;
        _title = title;
        _subtitle = subtitle;
        _floorColor = floorColor;
        _rugColor = rugColor;
        _propAccentColor = propAccentColor;

        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        TabStop = true;
        Cursor = Cursors.Hand;
        Size = new Size(196, 56);
    }

    public string SceneKey => _sceneKey;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool Selected
    {
        get => _selected;
        set
        {
            if (_selected != value)
            {
                _selected = value;
                Invalidate();
            }
        }
    }

    protected override void OnGotFocus(EventArgs e)
    {
        base.OnGotFocus(e);
        Invalidate();
    }

    protected override void OnLostFocus(EventArgs e)
    {
        base.OnLostFocus(e);
        Invalidate();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode is Keys.Space or Keys.Enter)
        {
            Clicked?.Invoke(_sceneKey);
            e.Handled = true;
        }
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        _hovered = true;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        _hovered = false;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Left)
        {
            Clicked?.Invoke(_sceneKey);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        ModernTheme.ConfigureHighQuality(g);
        g.Clear(Parent?.BackColor ?? ModernTheme.SurfaceWindow);

        RectangleF cardRect = new(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        Color bg = _selected
            ? ModernTheme.SurfaceCardActive
            : (_hovered ? ModernTheme.SurfaceCardHover : ModernTheme.SurfaceCard);
        Color border = _selected
            ? ModernTheme.AccentHoney
            : (_hovered ? ModernTheme.BorderHover : ModernTheme.BorderSubtle);

        using (GraphicsPath cardPath = ModernTheme.CreateRoundedRect(cardRect, 10f))
        using (SolidBrush bgBrush = new(bg))
        using (Pen borderPen = new(border, _selected ? 1.5f : 1f))
        {
            g.FillPath(bgBrush, cardPath);
            g.DrawPath(borderPen, cardPath);
        }

        // Visual mini-scene thumbnail swatch on the left (scaled for High-DPI)
        float scale = Math.Max(1f, DeviceDpi / 96f);
        float swatchSize = Math.Min(Height - 14f * scale, 34f * scale);
        RectangleF swatchRect = new(10f * scale, (Height - swatchSize) * 0.5f, swatchSize, swatchSize);
        using (GraphicsPath swatchPath = ModernTheme.CreateRoundedRect(swatchRect, 8f * scale))
        using (SolidBrush floorBrush = new(_floorColor))
        using (Pen swatchBorder = new(Color.FromArgb(90, 255, 255, 255), 1f))
        {
            g.FillPath(floorBrush, swatchPath);
            g.DrawPath(swatchBorder, swatchPath);
        }

        RectangleF innerRug = new(
            swatchRect.X + swatchSize * 0.15f,
            swatchRect.Y + swatchSize * 0.24f,
            swatchSize * 0.58f,
            swatchSize * 0.52f);
        using (GraphicsPath rugPath = ModernTheme.CreateRoundedRect(innerRug, 4f * scale))
        using (SolidBrush rugBrush = new(_rugColor))
        {
            g.FillPath(rugBrush, rugPath);
        }

        float propDot = 7f * scale;
        using (SolidBrush propBrush = new(_propAccentColor))
        {
            g.FillEllipse(propBrush, swatchRect.Right - propDot - 4f * scale, swatchRect.Y + 4f * scale, propDot, propDot);
        }

        if (_selected)
        {
            float activeDot = 6f * scale;
            using SolidBrush activeDotBrush = new(ModernTheme.AccentHoney);
            g.FillEllipse(activeDotBrush, Width - activeDot - 8f * scale, 9f * scale, activeDot, activeDot);
        }

        using Font titleFont = new("Segoe UI", 9.25f, FontStyle.Bold, GraphicsUnit.Point);
        using Font subFont = new("Segoe UI", 7.75f, FontStyle.Regular, GraphicsUnit.Point);
        using SolidBrush titleBrush = new(_selected ? ModernTheme.AccentHoneyBright : ModernTheme.InkPrimary);
        using SolidBrush subBrush = new(ModernTheme.InkSecondary);
        using StringFormat textSf = new()
        {
            Alignment = StringAlignment.Near,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.NoWrap,
        };

        float textX = swatchRect.Right + 10f * scale;
        float textW = Math.Max(24f, Width - textX - 10f * scale);
        RectangleF titleRect = new(textX, Height * 0.12f, textW, Height * 0.42f);
        RectangleF subRect = new(textX, Height * 0.52f, textW, Height * 0.36f);
        g.DrawString(_title, titleFont, titleBrush, titleRect, textSf);
        g.DrawString(_subtitle, subFont, subBrush, subRect, textSf);

        if (Focused && ShowFocusCues)
        {
            ModernTheme.DrawFocusRing(g, cardRect, 10f);
        }
    }
}

internal sealed class ModernStepperCard : Control
{
    private readonly string _title;
    private readonly string _unitSuffix;
    private readonly int _min;
    private readonly int _max;
    private int _value;
    private int _hoveredPart; // 0 = none, 1 = minus, 2 = plus, 3 = value pill
    private TextBox? _inlineEditor;
    private bool _committingEdit;

    public event Action<int>? ValueChanged;

    public ModernStepperCard(string title, int min, int max, int initialValue, string unitSuffix = "")
    {
        _title = title;
        _min = min;
        _max = Math.Max(min, max);
        _value = Math.Clamp(initialValue, _min, _max);
        _unitSuffix = unitSuffix;

        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        TabStop = true;
        Height = 46;
    }

    public bool IsUncapped => _max == int.MaxValue;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public int Value
    {
        get => _value;
        set
        {
            int clamped = Math.Clamp(value, _min, _max);
            if (_value != clamped)
            {
                _value = clamped;
                Invalidate();
            }
        }
    }

    private float DpiScale => Math.Max(1f, DeviceDpi / 96f);
    private RectangleF GetMinusRect()
    {
        float s = DpiScale;
        float btn = 28f * s;
        return new(Width - 118f * s, (Height - btn) * 0.5f, btn, btn);
    }

    private RectangleF GetValueRect()
    {
        float s = DpiScale;
        float h = 28f * s;
        return new(Width - 86f * s, (Height - h) * 0.5f, 46f * s, h);
    }

    private RectangleF GetPlusRect()
    {
        float s = DpiScale;
        float btn = 28f * s;
        return new(Width - 36f * s, (Height - btn) * 0.5f, btn, btn);
    }

    protected override void OnGotFocus(EventArgs e)
    {
        base.OnGotFocus(e);
        Invalidate();
    }

    protected override void OnLostFocus(EventArgs e)
    {
        base.OnLostFocus(e);
        Invalidate();
    }

    protected override bool IsInputKey(Keys keyData)
    {
        Keys keyCode = keyData & Keys.KeyCode;
        if (keyCode is Keys.Left or Keys.Right or Keys.Up or Keys.Down or Keys.PageUp or Keys.PageDown)
        {
            return true;
        }
        return base.IsInputKey(keyData);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        int step = e.Shift || e.KeyCode is Keys.PageUp or Keys.PageDown ? 5 : 1;
        if (e.KeyCode is Keys.Left or Keys.Down or Keys.PageDown && _value > _min)
        {
            ApplyStep(-step);
            e.Handled = true;
        }
        else if (e.KeyCode is Keys.Right or Keys.Up or Keys.PageUp && _value < _max)
        {
            ApplyStep(step);
            e.Handled = true;
        }
        else if (e.KeyCode is Keys.Enter or Keys.F2)
        {
            BeginInlineEdit();
            e.Handled = true;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        int nextPart = 0;
        if (GetMinusRect().Contains(e.Location))
        {
            nextPart = 1;
        }
        else if (GetPlusRect().Contains(e.Location))
        {
            nextPart = 2;
        }
        else if (GetValueRect().Contains(e.Location))
        {
            nextPart = 3;
        }

        Cursor = nextPart switch
        {
            1 when _value > _min => Cursors.Hand,
            2 when _value < _max => Cursors.Hand,
            3 => Cursors.IBeam,
            _ => Cursors.Default,
        };

        if (nextPart != _hoveredPart)
        {
            _hoveredPart = nextPart;
            Invalidate();
        }
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (_hoveredPart != 0)
        {
            _hoveredPart = 0;
            Invalidate();
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        int step = (ModifierKeys & Keys.Shift) != 0 ? 5 : 1;
        if (GetMinusRect().Contains(e.Location) && _value > _min)
        {
            ApplyStep(-step);
        }
        else if (GetPlusRect().Contains(e.Location) && _value < _max)
        {
            ApplyStep(step);
        }
        else if (GetValueRect().Contains(e.Location))
        {
            BeginInlineEdit();
        }
    }

    private void ApplyStep(int delta)
    {
        long candidate = (long)_value + delta;
        int next = (int)Math.Clamp(candidate, _min, _max);
        if (next != _value)
        {
            _value = next;
            Invalidate();
            ValueChanged?.Invoke(_value);
        }
    }

    private void BeginInlineEdit()
    {
        if (_inlineEditor is not null)
        {
            _inlineEditor.Focus();
            _inlineEditor.SelectAll();
            return;
        }

        RectangleF valRect = GetValueRect();
        float s = DpiScale;
        var editor = new TextBox
        {
            BorderStyle = BorderStyle.None,
            BackColor = ModernTheme.SurfaceRecessed,
            ForeColor = ModernTheme.AccentHoneyBright,
            Font = new Font("Segoe UI", 9.25f, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = HorizontalAlignment.Center,
            Text = _value.ToString(),
            Location = new Point((int)(valRect.X + 3 * s), (int)(valRect.Y + 6 * s)),
            Size = new Size((int)Math.Max(20f, valRect.Width - 6 * s), (int)Math.Max(16f, valRect.Height - 10 * s)),
            MaxLength = 5,
        };

        editor.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter)
            {
                CommitInlineEdit();
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
            else if (e.KeyCode == Keys.Escape)
            {
                CancelInlineEdit();
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
        };
        editor.KeyPress += (_, e) =>
        {
            if (!char.IsControl(e.KeyChar) && !char.IsDigit(e.KeyChar))
            {
                e.Handled = true;
            }
        };
        editor.LostFocus += (_, _) => CommitInlineEdit();

        _inlineEditor = editor;
        Controls.Add(editor);
        editor.Focus();
        editor.SelectAll();
    }

    private void CommitInlineEdit()
    {
        if (_committingEdit || _inlineEditor is null)
        {
            return;
        }

        _committingEdit = true;
        try
        {
            TextBox editor = _inlineEditor;
            string raw = editor.Text.Trim();
            _inlineEditor = null;
            Controls.Remove(editor);
            editor.Dispose();

            if (int.TryParse(raw, out int parsed))
            {
                int next = Math.Clamp(parsed, _min, _max);
                if (next != _value)
                {
                    _value = next;
                    Invalidate();
                    ValueChanged?.Invoke(_value);
                }
            }
        }
        finally
        {
            _committingEdit = false;
        }
    }

    private void CancelInlineEdit()
    {
        if (_inlineEditor is null)
        {
            return;
        }

        TextBox editor = _inlineEditor;
        _inlineEditor = null;
        Controls.Remove(editor);
        editor.Dispose();
        Focus();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        ModernTheme.ConfigureHighQuality(g);
        g.Clear(Parent?.BackColor ?? ModernTheme.SurfaceWindow);

        RectangleF cardRect = new(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        using (GraphicsPath cardPath = ModernTheme.CreateRoundedRect(cardRect, 10f))
        using (SolidBrush cardBrush = new(ModernTheme.SurfaceCard))
        using (Pen borderPen = new(ModernTheme.BorderSubtle, 1f))
        {
            g.FillPath(cardBrush, cardPath);
            g.DrawPath(borderPen, cardPath);
        }

        float scale = DpiScale;
        RectangleF minusRect = GetMinusRect();
        RectangleF valRect = GetValueRect();
        RectangleF plusRect = GetPlusRect();

        float leftX = 12f * scale;
        float meterW = Math.Max(36f, minusRect.X - leftX - 12f * scale);

        using Font titleFont = new("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point);
        using SolidBrush titleBrush = new(ModernTheme.InkPrimary);
        using StringFormat titleSf = new()
        {
            Alignment = StringAlignment.Near,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.NoWrap,
        };
        g.DrawString(_title, titleFont, titleBrush, new RectangleF(leftX, Height * 0.12f, meterW, Height * 0.46f), titleSf);

        float meterY = Height * 0.70f;
        float meterH = 4.5f * scale;
        RectangleF meterTrack = new(leftX, meterY, meterW, meterH);
        using (GraphicsPath trackPath = ModernTheme.CreateRoundedRect(meterTrack, meterH * 0.5f))
        using (SolidBrush trackBrush = new(ModernTheme.SurfaceRecessed))
        {
            g.FillPath(trackBrush, trackPath);
        }

        float ratio = IsUncapped
            ? (float)(Math.Log10(_value + 1.0) / Math.Log10(101.0))
            : (_max > _min ? (float)(_value - _min) / (_max - _min) : 1f);
        float fillW = Math.Max(6f * scale, meterW * Math.Clamp(ratio, 0f, 1f));
        RectangleF meterFill = new(leftX, meterY, fillW, meterH);
        using (GraphicsPath fillPath = ModernTheme.CreateRoundedRect(meterFill, meterH * 0.5f))
        using (SolidBrush fillBrush = new(ModernTheme.AccentHoney))
        {
            g.FillPath(fillBrush, fillPath);
        }

        bool canDec = _value > _min;
        bool canInc = _value < _max;

        DrawStepButton(g, minusRect, isPlus: false, enabled: canDec, hovered: _hoveredPart == 1 && canDec);
        DrawStepButton(g, plusRect, isPlus: true, enabled: canInc, hovered: _hoveredPart == 2 && canInc);

        bool pillHovered = _hoveredPart == 3;
        using (GraphicsPath valPath = ModernTheme.CreateRoundedRect(valRect, 7f))
        using (SolidBrush valBg = new(pillHovered ? ModernTheme.SurfaceCardHover : ModernTheme.SurfaceRecessed))
        using (Pen valBorder = new(pillHovered ? ModernTheme.AccentHoney : ModernTheme.BorderSubtle, 1f))
        {
            g.FillPath(valBg, valPath);
            g.DrawPath(valBorder, valPath);
        }

        using Font valFont = new("Segoe UI", 9.25f, FontStyle.Bold, GraphicsUnit.Point);
        using SolidBrush valTextBrush = new(ModernTheme.AccentHoneyBright);
        using StringFormat sf = new()
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            FormatFlags = StringFormatFlags.NoWrap,
        };
        string display = string.IsNullOrEmpty(_unitSuffix) ? $"{_value}" : $"{_value}{_unitSuffix}";
        g.DrawString(display, valFont, valTextBrush, valRect, sf);

        if (Focused && ShowFocusCues)
        {
            ModernTheme.DrawFocusRing(g, cardRect, 10f);
        }
    }

    private static void DrawStepButton(Graphics g, RectangleF rect, bool isPlus, bool enabled, bool hovered)
    {
        Color bg = !enabled
            ? ModernTheme.SurfaceRecessed
            : (hovered ? ModernTheme.SurfaceCardHover : ModernTheme.SurfaceWindow);
        Color border = !enabled
            ? ModernTheme.BorderSubtle
            : (hovered ? ModernTheme.AccentHoney : ModernTheme.BorderHover);
        Color glyph = !enabled
            ? ModernTheme.InkDisabled
            : (hovered ? ModernTheme.AccentHoneyBright : ModernTheme.InkPrimary);

        using (GraphicsPath path = ModernTheme.CreateRoundedRect(rect, 7f))
        using (SolidBrush brush = new(bg))
        using (Pen pen = new(border, 1f))
        {
            g.FillPath(brush, path);
            g.DrawPath(pen, path);
        }

        float cx = rect.X + rect.Width * 0.5f;
        float cy = rect.Y + rect.Height * 0.5f;
        using Pen glyphPen = new(glyph, 1.8f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
        };
        g.DrawLine(glyphPen, cx - 4.5f, cy, cx + 4.5f, cy);
        if (isPlus)
        {
            g.DrawLine(glyphPen, cx, cy - 4.5f, cx, cy + 4.5f);
        }
    }
}

internal sealed class ModernOptionPicker : Control
{
    private readonly string _title;
    private readonly List<(string Key, string Label, Color Swatch)> _options = [];
    private int _selectedIndex;
    private int _hoveredPart; // 0 = none, 1 = prev, 2 = pill, 3 = next

    public event Action<string>? SelectionChanged;
    public event Action? MenuOpening;
    public event Action? MenuClosed;

    public ModernOptionPicker(
        string title,
        IEnumerable<(string Key, string Label, Color Swatch)> options,
        string initialKey)
    {
        _title = title;
        _options.AddRange(options);
        _selectedIndex = Math.Max(0, _options.FindIndex(o => string.Equals(o.Key, initialKey, StringComparison.OrdinalIgnoreCase)));

        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        TabStop = true;
        Height = 44;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string SelectedKey
    {
        get => _options.Count > 0 ? _options[_selectedIndex].Key : string.Empty;
        set
        {
            int idx = _options.FindIndex(o => string.Equals(o.Key, value ?? string.Empty, StringComparison.OrdinalIgnoreCase));
            int resolved = idx >= 0 ? idx : 0;
            if (_selectedIndex != resolved)
            {
                _selectedIndex = resolved;
                Invalidate();
            }
        }
    }

    private float DpiScale => Math.Max(1f, DeviceDpi / 96f);
    private RectangleF GetPrevRect()
    {
        float s = DpiScale;
        float h = 28f * s;
        return new(Width - 196f * s, (Height - h) * 0.5f, 26f * s, h);
    }

    private RectangleF GetPillRect()
    {
        float s = DpiScale;
        float h = 28f * s;
        return new(Width - 166f * s, (Height - h) * 0.5f, 126f * s, h);
    }

    private RectangleF GetNextRect()
    {
        float s = DpiScale;
        float h = 28f * s;
        return new(Width - 36f * s, (Height - h) * 0.5f, 26f * s, h);
    }

    protected override void OnGotFocus(EventArgs e)
    {
        base.OnGotFocus(e);
        Invalidate();
    }

    protected override void OnLostFocus(EventArgs e)
    {
        base.OnLostFocus(e);
        Invalidate();
    }

    protected override bool IsInputKey(Keys keyData)
    {
        if (keyData is Keys.Left or Keys.Right or Keys.Down or Keys.Up)
        {
            return true;
        }
        return base.IsInputKey(keyData);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (_options.Count == 0)
        {
            return;
        }

        if (e.KeyCode == Keys.Left)
        {
            StepOption(-1);
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.Right)
        {
            StepOption(1);
            e.Handled = true;
        }
        else if (e.KeyCode is Keys.Space or Keys.Enter or Keys.Down)
        {
            ShowSelectionMenu();
            e.Handled = true;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        int nextPart = 0;
        if (GetPrevRect().Contains(e.Location)) nextPart = 1;
        else if (GetPillRect().Contains(e.Location)) nextPart = 2;
        else if (GetNextRect().Contains(e.Location)) nextPart = 3;

        Cursor = nextPart != 0 ? Cursors.Hand : Cursors.Default;
        if (nextPart != _hoveredPart)
        {
            _hoveredPart = nextPart;
            Invalidate();
        }
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (_hoveredPart != 0)
        {
            _hoveredPart = 0;
            Invalidate();
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || _options.Count == 0)
        {
            return;
        }

        if (GetPrevRect().Contains(e.Location))
        {
            StepOption(-1);
        }
        else if (GetNextRect().Contains(e.Location))
        {
            StepOption(1);
        }
        else if (GetPillRect().Contains(e.Location))
        {
            ShowSelectionMenu();
        }
    }

    private void StepOption(int delta)
    {
        if (_options.Count <= 1)
        {
            return;
        }

        _selectedIndex = (_selectedIndex + delta + _options.Count) % _options.Count;
        Invalidate();
        SelectionChanged?.Invoke(_options[_selectedIndex].Key);
    }

    private void ShowSelectionMenu()
    {
        if (_options.Count == 0)
        {
            return;
        }

        var menu = new ContextMenuStrip
        {
            Renderer = new ModernMenuRenderer(),
            ShowImageMargin = false,
            ShowCheckMargin = true,
            MaximumSize = new Size((int)(240 * DpiScale), (int)(360 * DpiScale)),
            Font = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
        };

        for (int i = 0; i < _options.Count; i++)
        {
            int index = i;
            var opt = _options[i];
            var item = new ToolStripMenuItem(opt.Label)
            {
                Checked = index == _selectedIndex,
                ForeColor = ModernTheme.InkPrimary,
            };
            item.Click += (_, _) =>
            {
                if (_selectedIndex != index)
                {
                    _selectedIndex = index;
                    Invalidate();
                    SelectionChanged?.Invoke(_options[_selectedIndex].Key);
                }
            };
            menu.Items.Add(item);
        }

        menu.Closed += (_, _) =>
        {
            MenuClosed?.Invoke();
            BeginInvoke(() => menu.Dispose());
        };

        MenuOpening?.Invoke();
        RectangleF pill = GetPillRect();
        menu.Show(this, new Point((int)pill.X, (int)pill.Bottom + 4));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        ModernTheme.ConfigureHighQuality(g);
        g.Clear(Parent?.BackColor ?? ModernTheme.SurfaceWindow);

        RectangleF cardRect = new(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        using (GraphicsPath cardPath = ModernTheme.CreateRoundedRect(cardRect, 10f))
        using (SolidBrush cardBrush = new(ModernTheme.SurfaceCard))
        using (Pen borderPen = new(ModernTheme.BorderSubtle, 1f))
        {
            g.FillPath(cardBrush, cardPath);
            g.DrawPath(borderPen, cardPath);
        }

        var current = _options.Count > 0
            ? _options[_selectedIndex]
            : (Key: "mix", Label: "All Breeds", Swatch: ModernTheme.AccentHoney);

        float s = DpiScale;
        // Coat / theme swatch indicator dot(s) on left
        float dotY = (Height - 8f * s) * 0.5f;
        if (string.Equals(current.Key, "mix", StringComparison.OrdinalIgnoreCase))
        {
            using SolidBrush b1 = new(Color.FromArgb(234, 198, 152));
            using SolidBrush b2 = new(Color.FromArgb(148, 160, 174));
            using SolidBrush b3 = new(Color.FromArgb(214, 134, 88));
            g.FillEllipse(b1, 12f * s, dotY, 7f * s, 7f * s);
            g.FillEllipse(b2, 17f * s, dotY, 7f * s, 7f * s);
            g.FillEllipse(b3, 22f * s, dotY, 7f * s, 7f * s);
        }
        else if (current.Swatch != Color.Transparent)
        {
            using SolidBrush swatchBrush = new(current.Swatch);
            using Pen ringPen = new(Color.FromArgb(90, 255, 255, 255), 1f);
            g.FillEllipse(swatchBrush, 12f * s, dotY - 0.5f * s, 9f * s, 9f * s);
            g.DrawEllipse(ringPen, 12f * s, dotY - 0.5f * s, 9f * s, 9f * s);
        }
        else
        {
            using Pen ringPen = new(ModernTheme.InkMuted, 1.2f);
            g.DrawEllipse(ringPen, 12f * s, dotY - 0.5f * s, 9f * s, 9f * s);
        }

        using Font titleFont = new("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point);
        using SolidBrush titleBrush = new(ModernTheme.InkPrimary);
        using StringFormat leftSf = new()
        {
            Alignment = StringAlignment.Near,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.NoWrap,
        };
        float labelX = string.Equals(current.Key, "mix", StringComparison.OrdinalIgnoreCase) ? 35f * s : 27f * s;
        g.DrawString(_title, titleFont, titleBrush, new RectangleF(labelX, 0f, Math.Max(20f, Width - 200f * s - labelX), Height), leftSf);

        RectangleF prevRect = GetPrevRect();
        RectangleF pillRect = GetPillRect();
        RectangleF nextRect = GetNextRect();

        DrawChevronButton(g, prevRect, isRight: false, hovered: _hoveredPart == 1);
        DrawChevronButton(g, nextRect, isRight: true, hovered: _hoveredPart == 3);

        bool pillHover = _hoveredPart == 2;
        using (GraphicsPath pillPath = ModernTheme.CreateRoundedRect(pillRect, 7f))
        using (SolidBrush pillBg = new(pillHover ? ModernTheme.SurfaceCardHover : ModernTheme.SurfaceRecessed))
        using (Pen pillBorder = new(pillHover ? ModernTheme.AccentHoney : ModernTheme.BorderSubtle, 1f))
        {
            g.FillPath(pillBg, pillPath);
            g.DrawPath(pillBorder, pillPath);
        }

        using Font valFont = new("Segoe UI", 8.5f, FontStyle.Bold, GraphicsUnit.Point);
        using SolidBrush valBrush = new(ModernTheme.AccentHoneyBright);
        using StringFormat centerSf = new()
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.NoWrap,
        };
        g.DrawString(current.Label, valFont, valBrush, RectangleF.Inflate(pillRect, -4f, 0f), centerSf);

        if (Focused && ShowFocusCues)
        {
            ModernTheme.DrawFocusRing(g, cardRect, 10f);
        }
    }

    private static void DrawChevronButton(Graphics g, RectangleF rect, bool isRight, bool hovered)
    {
        Color bg = hovered ? ModernTheme.SurfaceCardHover : ModernTheme.SurfaceWindow;
        Color border = hovered ? ModernTheme.AccentHoney : ModernTheme.BorderHover;
        Color glyph = hovered ? ModernTheme.AccentHoneyBright : ModernTheme.InkPrimary;

        using (GraphicsPath path = ModernTheme.CreateRoundedRect(rect, 7f))
        using (SolidBrush brush = new(bg))
        using (Pen pen = new(border, 1f))
        {
            g.FillPath(brush, path);
            g.DrawPath(pen, path);
        }

        float cx = rect.X + rect.Width * 0.5f;
        float cy = rect.Y + rect.Height * 0.5f;
        float dir = isRight ? 1f : -1f;
        using Pen penGlyph = new(glyph, 1.7f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
        };
        g.DrawLines(penGlyph, [
            new PointF(cx - 2.2f * dir, cy - 4f),
            new PointF(cx + 2.2f * dir, cy),
            new PointF(cx - 2.2f * dir, cy + 4f),
        ]);
    }
}

internal sealed class ModernActionChip : Control
{
    private string _label;
    private bool _active;
    private readonly bool _useCoralAccent;
    private ActionGlyph _glyph;
    private bool _hovered;
    private bool _pressed;

    public ModernActionChip(string label, bool useCoralAccent = false, ActionGlyph glyph = ActionGlyph.None)
    {
        _label = label;
        _useCoralAccent = useCoralAccent;
        _glyph = glyph;
        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        TabStop = true;
        Cursor = Cursors.Hand;
        Size = new Size(156, 36);
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string ChipLabel
    {
        get => _label;
        set
        {
            if (_label != value)
            {
                _label = value;
                Invalidate();
            }
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool Active
    {
        get => _active;
        set
        {
            if (_active != value)
            {
                _active = value;
                Invalidate();
            }
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public ActionGlyph Glyph
    {
        get => _glyph;
        set
        {
            if (_glyph != value)
            {
                _glyph = value;
                Invalidate();
            }
        }
    }

    protected override void OnGotFocus(EventArgs e)
    {
        base.OnGotFocus(e);
        Invalidate();
    }

    protected override void OnLostFocus(EventArgs e)
    {
        base.OnLostFocus(e);
        Invalidate();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode is Keys.Space or Keys.Enter)
        {
            OnClick(EventArgs.Empty);
            e.Handled = true;
        }
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        _hovered = true;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        _hovered = false;
        _pressed = false;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Left)
        {
            _pressed = true;
            Invalidate();
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (_pressed)
        {
            _pressed = false;
            Invalidate();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        ModernTheme.ConfigureHighQuality(g);
        g.Clear(Parent?.BackColor ?? ModernTheme.SurfaceWindow);

        RectangleF rect = new(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        if (_pressed)
        {
            rect.Inflate(-0.6f, -0.6f);
        }

        Color accent = _useCoralAccent ? ModernTheme.AccentCoral : ModernTheme.AccentHoney;
        Color bg;
        Color border;
        Color fg;

        if (_active)
        {
            bg = _useCoralAccent ? Color.FromArgb(68, 30, 26) : ModernTheme.AccentHoney;
            border = accent;
            fg = _useCoralAccent ? ModernTheme.InkPrimary : ModernTheme.InkOnAccent;
        }
        else
        {
            bg = _hovered ? ModernTheme.SurfaceCardHover : ModernTheme.SurfaceCard;
            border = _hovered ? ModernTheme.BorderHover : ModernTheme.BorderSubtle;
            fg = _hovered ? ModernTheme.InkPrimary : ModernTheme.InkSecondary;
        }

        using (GraphicsPath path = ModernTheme.CreateRoundedRect(rect, 9f))
        using (SolidBrush bgBrush = new(bg))
        using (Pen borderPen = new(border, _active ? 1.4f : 1f))
        {
            g.FillPath(bgBrush, path);
            g.DrawPath(borderPen, path);
        }

        using Font font = new("Segoe UI", 8.75f, _active ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);
        using SolidBrush fgBrush = new(fg);
        using StringFormat sf = new()
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            FormatFlags = StringFormatFlags.NoWrap,
        };

        if (_glyph != ActionGlyph.None)
        {
            float s = Math.Max(1f, DeviceDpi / 96f);
            SizeF textSize = g.MeasureString(_label, font);
            float glyphSize = 13f * s;
            float gap = 5f * s;
            float totalW = glyphSize + gap + textSize.Width;
            float startX = rect.X + Math.Max(8f * s, (rect.Width - totalW) * 0.5f);
            float cy = rect.Y + rect.Height * 0.5f;

            Color glyphColor = (_active && _useCoralAccent) ? ModernTheme.AccentCoral : fg;
            DrawGlyph(g, _glyph, startX + glyphSize * 0.5f, cy, glyphColor, s);

            RectangleF textRect = new(startX + glyphSize + gap, rect.Y, Math.Max(20f, rect.Right - (startX + glyphSize + gap) - 5f * s), rect.Height);
            using StringFormat nearSf = new()
            {
                Alignment = StringAlignment.Near,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.NoWrap,
            };
            g.DrawString(_label, font, fgBrush, textRect, nearSf);
        }
        else
        {
            g.DrawString(_label, font, fgBrush, rect, sf);
        }

        if (Focused && ShowFocusCues)
        {
            ModernTheme.DrawFocusRing(g, rect, 9f);
        }
    }

    private static void DrawGlyph(Graphics g, ActionGlyph glyph, float cx, float cy, Color color, float s)
    {
        using Pen pen = new(color, 1.5f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
        };
        using SolidBrush brush = new(color);

        switch (glyph)
        {
            case ActionGlyph.Laser:
                g.DrawLine(pen, cx - 5f * s, cy + 4.5f * s, cx + 1.5f * s, cy - 2f * s);
                g.FillEllipse(brush, cx + 1.8f * s, cy - 5.2f * s, 4.2f * s, 4.2f * s);
                break;

            case ActionGlyph.Yarn:
                g.DrawEllipse(pen, cx - 5f * s, cy - 5f * s, 10f * s, 10f * s);
                g.DrawArc(pen, cx - 4f * s, cy - 3.5f * s, 8f * s, 7f * s, 200, 150);
                g.DrawLine(pen, cx + 2.5f * s, cy + 3.5f * s, cx + 6f * s, cy + 5.2f * s);
                break;

            case ActionGlyph.Box:
                g.DrawRectangle(pen, cx - 5f * s, cy - 2.5f * s, 10f * s, 7.5f * s);
                g.DrawLine(pen, cx - 5f * s, cy - 2.5f * s, cx - 2.5f * s, cy - 5.5f * s);
                g.DrawLine(pen, cx + 5f * s, cy - 2.5f * s, cx + 2.5f * s, cy - 5.5f * s);
                g.DrawLine(pen, cx - 2.5f * s, cy - 5.5f * s, cx + 2.5f * s, cy - 5.5f * s);
                break;

            case ActionGlyph.Treat:
                // Minimal treat / star kibble nugget
                g.FillEllipse(brush, cx - 3.8f * s, cy - 2.4f * s, 3.6f * s, 4.8f * s);
                g.FillEllipse(brush, cx + 0.2f * s, cy - 2.4f * s, 3.6f * s, 4.8f * s);
                g.DrawEllipse(pen, cx - 4.8f * s, cy - 3.4f * s, 9.6f * s, 6.8f * s);
                break;

            case ActionGlyph.Mouse:
                // Plush mouse toy silhouette with curved tail
                g.DrawEllipse(pen, cx - 4.8f * s, cy - 2.8f * s, 7.2f * s, 5.6f * s);
                g.DrawEllipse(pen, cx - 4.5f * s, cy - 4.6f * s, 3f * s, 3f * s);
                g.DrawArc(pen, cx + 1.5f * s, cy - 2f * s, 4.2f * s, 4.5f * s, 260, 180);
                break;

            case ActionGlyph.Fish:
                // Minimal fish silhouette
                g.DrawEllipse(pen, cx - 5f * s, cy - 3.2f * s, 7.5f * s, 6.4f * s);
                g.DrawLines(pen, [
                    new PointF(cx + 2.5f * s, cy),
                    new PointF(cx + 5.5f * s, cy - 3f * s),
                    new PointF(cx + 5.5f * s, cy + 3f * s),
                    new PointF(cx + 2.5f * s, cy),
                ]);
                break;

            case ActionGlyph.SoundOn:
                g.DrawPolygon(pen, [
                    new PointF(cx - 5f * s, cy - 2f * s),
                    new PointF(cx - 2.5f * s, cy - 2f * s),
                    new PointF(cx + 0.5f * s, cy - 4.5f * s),
                    new PointF(cx + 0.5f * s, cy + 4.5f * s),
                    new PointF(cx - 2.5f * s, cy + 2f * s),
                    new PointF(cx - 5f * s, cy + 2f * s),
                ]);
                g.DrawArc(pen, cx + 1.5f * s, cy - 3.2f * s, 3.8f * s, 6.4f * s, -60, 120);
                break;

            case ActionGlyph.SoundOff:
                g.DrawPolygon(pen, [
                    new PointF(cx - 5f * s, cy - 2f * s),
                    new PointF(cx - 2.5f * s, cy - 2f * s),
                    new PointF(cx + 0.5f * s, cy - 4.5f * s),
                    new PointF(cx + 0.5f * s, cy + 4.5f * s),
                    new PointF(cx - 2.5f * s, cy + 2f * s),
                    new PointF(cx - 5f * s, cy + 2f * s),
                ]);
                g.DrawLine(pen, cx + 2.5f * s, cy - 2.2f * s, cx + 5.5f * s, cy + 2.2f * s);
                g.DrawLine(pen, cx + 5.5f * s, cy - 2.2f * s, cx + 2.5f * s, cy + 2.2f * s);
                break;

            case ActionGlyph.Kitten:
                // Small cat ear outline
                g.DrawLines(pen, [
                    new PointF(cx - 4.8f * s, cy + 3.8f * s),
                    new PointF(cx - 4.4f * s, cy - 4.2f * s),
                    new PointF(cx - 1.5f * s, cy - 1.4f * s),
                    new PointF(cx + 1.5f * s, cy - 1.4f * s),
                    new PointF(cx + 4.4f * s, cy - 4.2f * s),
                    new PointF(cx + 4.8f * s, cy + 3.8f * s),
                    new PointF(cx, cy + 5f * s),
                    new PointF(cx - 4.8f * s, cy + 3.8f * s),
                ]);
                break;

            case ActionGlyph.Camera:
                g.DrawRectangle(pen, cx - 5.2f * s, cy - 3.2f * s, 10.4f * s, 7.2f * s);
                g.DrawEllipse(pen, cx - 2.2f * s, cy - 1.8f * s, 4.4f * s, 4.4f * s);
                g.DrawLine(pen, cx - 2.2f * s, cy - 4.6f * s, cx + 2.2f * s, cy - 4.6f * s);
                break;

            case ActionGlyph.Pause:
                g.DrawLine(pen, cx - 2.3f * s, cy - 4.2f * s, cx - 2.3f * s, cy + 4.2f * s);
                g.DrawLine(pen, cx + 2.3f * s, cy - 4.2f * s, cx + 2.3f * s, cy + 4.2f * s);
                break;

            case ActionGlyph.Play:
                g.FillPolygon(brush, [
                    new PointF(cx - 2.8f * s, cy - 4.5f * s),
                    new PointF(cx + 4.5f * s, cy),
                    new PointF(cx - 2.8f * s, cy + 4.5f * s),
                ]);
                break;

            case ActionGlyph.Window:
                g.DrawRectangle(pen, cx - 5.2f * s, cy - 4.2f * s, 10.4f * s, 8.4f * s);
                g.DrawLine(pen, cx - 5.2f * s, cy - 1.5f * s, cx + 5.2f * s, cy - 1.5f * s);
                break;

            case ActionGlyph.Wallpaper:
                g.DrawRectangle(pen, cx - 5.5f * s, cy - 4.5f * s, 11f * s, 7.5f * s);
                g.DrawLine(pen, cx - 2.5f * s, cy + 5f * s, cx + 2.5f * s, cy + 5f * s);
                break;

            case ActionGlyph.Settings:
                g.DrawLine(pen, cx - 5f * s, cy - 2.6f * s, cx + 5f * s, cy - 2.6f * s);
                g.DrawLine(pen, cx - 5f * s, cy + 2.6f * s, cx + 5f * s, cy + 2.6f * s);
                g.FillEllipse(brush, cx - 3.2f * s, cy - 4.4f * s, 3.6f * s, 3.6f * s);
                g.FillEllipse(brush, cx + 0.4f * s, cy + 0.8f * s, 3.6f * s, 3.6f * s);
                break;

            case ActionGlyph.Refresh:
                g.DrawArc(pen, cx - 4.6f * s, cy - 4.6f * s, 9.2f * s, 9.2f * s, 40, 280);
                g.DrawLines(pen, [
                    new PointF(cx + 2.2f * s, cy - 5.2f * s),
                    new PointF(cx + 4.8f * s, cy - 2.6f * s),
                    new PointF(cx + 1.6f * s, cy - 2.0f * s),
                ]);
                break;
        }
    }
}

internal sealed class ModernToggleRow : Control
{
    private readonly string _title;
    private readonly string _subtitle;
    private bool _checked;
    private bool _hovered;

    public event Action<bool>? CheckedChanged;

    public ModernToggleRow(string title, string subtitle, bool initialChecked = false)
    {
        _title = title;
        _subtitle = subtitle;
        _checked = initialChecked;

        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        TabStop = true;
        Cursor = Cursors.Hand;
        Height = string.IsNullOrEmpty(subtitle) ? 40 : 48;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool Checked
    {
        get => _checked;
        set
        {
            if (_checked != value)
            {
                _checked = value;
                Invalidate();
            }
        }
    }

    protected override void OnGotFocus(EventArgs e)
    {
        base.OnGotFocus(e);
        Invalidate();
    }

    protected override void OnLostFocus(EventArgs e)
    {
        base.OnLostFocus(e);
        Invalidate();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode is Keys.Space or Keys.Enter)
        {
            Toggle();
            e.Handled = true;
        }
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        _hovered = true;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        _hovered = false;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Left)
        {
            Toggle();
        }
    }

    private void Toggle()
    {
        _checked = !_checked;
        Invalidate();
        CheckedChanged?.Invoke(_checked);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        ModernTheme.ConfigureHighQuality(g);
        g.Clear(Parent?.BackColor ?? ModernTheme.SurfaceWindow);

        RectangleF cardRect = new(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
        Color bg = _hovered ? ModernTheme.SurfaceCardHover : ModernTheme.SurfaceCard;
        Color border = _checked
            ? Color.FromArgb(120, ModernTheme.AccentHoney)
            : (_hovered ? ModernTheme.BorderHover : ModernTheme.BorderSubtle);

        using (GraphicsPath path = ModernTheme.CreateRoundedRect(cardRect, 10f))
        using (SolidBrush bgBrush = new(bg))
        using (Pen borderPen = new(border, 1f))
        {
            g.FillPath(bgBrush, path);
            g.DrawPath(borderPen, path);
        }

        float scale = Math.Max(1f, DeviceDpi / 96f);
        float pad = 14f * scale;
        float switchW = 38f * scale;
        float switchH = 20f * scale;
        RectangleF switchRect = new(Width - switchW - pad, (Height - switchH) * 0.5f, switchW, switchH);
        float textW = Math.Max(32f, switchRect.X - pad - 10f * scale);

        using Font titleFont = new("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point);
        using SolidBrush titleBrush = new(ModernTheme.InkPrimary);
        using StringFormat textSf = new()
        {
            Alignment = StringAlignment.Near,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.NoWrap,
        };
        if (string.IsNullOrEmpty(_subtitle))
        {
            g.DrawString(_title, titleFont, titleBrush, new RectangleF(pad, 0f, textW, Height), textSf);
        }
        else
        {
            using Font subFont = new("Segoe UI", 7.75f, FontStyle.Regular, GraphicsUnit.Point);
            using SolidBrush subBrush = new(ModernTheme.InkSecondary);
            RectangleF titleRect = new(pad, Height * 0.12f, textW, Height * 0.42f);
            RectangleF subRect = new(pad, Height * 0.52f, textW, Height * 0.36f);
            g.DrawString(_title, titleFont, titleBrush, titleRect, textSf);
            g.DrawString(_subtitle, subFont, subBrush, subRect, textSf);
        }

        Color trackColor = _checked ? ModernTheme.AccentHoney : ModernTheme.SurfaceRecessed;
        Color trackBorder = _checked ? ModernTheme.AccentHoneyBright : ModernTheme.BorderHover;

        using (GraphicsPath switchPath = ModernTheme.CreateRoundedRect(switchRect, switchH * 0.5f))
        using (SolidBrush trackBrush = new(trackColor))
        using (Pen trackPen = new(trackBorder, 1f))
        {
            g.FillPath(trackBrush, switchPath);
            g.DrawPath(trackPen, switchPath);
        }

        float thumbSize = 14f * scale;
        float thumbPad = 3f * scale;
        float thumbX = _checked ? (switchRect.Right - thumbSize - thumbPad) : (switchRect.X + thumbPad);
        float thumbY = switchRect.Y + (switchH - thumbSize) * 0.5f;
        Color thumbColor = _checked ? ModernTheme.InkOnAccent : ModernTheme.InkSecondary;

        using (SolidBrush thumbBrush = new(thumbColor))
        {
            g.FillEllipse(thumbBrush, thumbX, thumbY, thumbSize, thumbSize);
        }

        if (Focused && ShowFocusCues)
        {
            ModernTheme.DrawFocusRing(g, cardRect, 10f);
        }
    }
}

internal sealed class ModernMenuRenderer : ToolStripProfessionalRenderer
{
    public ModernMenuRenderer() : base(new ModernMenuColorTable())
    {
        RoundedEdges = true;
    }

    protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
    {
        using SolidBrush bg = new(ModernTheme.SurfaceWindow);
        e.Graphics.FillRectangle(bg, e.AffectedBounds);
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        Rectangle rect = new(0, 0, e.AffectedBounds.Width - 1, e.AffectedBounds.Height - 1);
        using Pen pen = new(ModernTheme.BorderOuter, 1f);
        e.Graphics.DrawRectangle(pen, rect);
    }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
    {
        if (!e.Item.Selected)
        {
            return;
        }

        ModernTheme.ConfigureHighQuality(e.Graphics);
        RectangleF rect = new(4f, 1f, e.Item.Width - 8f, e.Item.Height - 2f);
        using GraphicsPath path = ModernTheme.CreateRoundedRect(rect, 6f);
        using SolidBrush hoverBrush = new(ModernTheme.SurfaceCardHover);
        e.Graphics.FillPath(hoverBrush, path);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = e.Item.Enabled
            ? (e.Item.Selected ? ModernTheme.AccentHoneyBright : ModernTheme.InkPrimary)
            : ModernTheme.InkDisabled;
        base.OnRenderItemText(e);
    }

    protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
    {
        ModernTheme.ConfigureHighQuality(e.Graphics);
        Rectangle r = e.ImageRectangle;
        float cx = r.X + r.Width * 0.5f;
        float cy = r.Y + r.Height * 0.5f;
        using Pen pen = new(ModernTheme.AccentHoney, 1.9f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
        };
        e.Graphics.DrawLines(pen, [
            new PointF(cx - 4f, cy),
            new PointF(cx - 1.2f, cy + 3f),
            new PointF(cx + 4.2f, cy - 3f),
        ]);
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
    {
        int y = e.Item.Height / 2;
        using Pen pen = new(ModernTheme.Divider, 1f);
        e.Graphics.DrawLine(pen, 10, y, e.Item.Width - 10, y);
    }

    protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
    {
        e.ArrowColor = e.Item?.Selected == true ? ModernTheme.AccentHoneyBright : ModernTheme.InkSecondary;
        base.OnRenderArrow(e);
    }

    private sealed class ModernMenuColorTable : ProfessionalColorTable
    {
        public override Color MenuBorder => ModernTheme.BorderOuter;
        public override Color MenuItemBorder => Color.Transparent;
        public override Color MenuItemSelected => ModernTheme.SurfaceCardHover;
        public override Color MenuItemSelectedGradientBegin => ModernTheme.SurfaceCardHover;
        public override Color MenuItemSelectedGradientEnd => ModernTheme.SurfaceCardHover;
        public override Color ToolStripDropDownBackground => ModernTheme.SurfaceWindow;
        public override Color ImageMarginGradientBegin => ModernTheme.SurfaceWindow;
        public override Color ImageMarginGradientMiddle => ModernTheme.SurfaceWindow;
        public override Color ImageMarginGradientEnd => ModernTheme.SurfaceWindow;
        public override Color SeparatorDark => ModernTheme.Divider;
        public override Color SeparatorLight => ModernTheme.Divider;
    }
}
