using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace NekoScape.Host.Settings;

internal static class ModernTheme
{
    public static readonly Color SurfaceWindow = Color.FromArgb(24, 17, 14);
    public static readonly Color SurfaceCard = Color.FromArgb(37, 27, 22);
    public static readonly Color SurfaceCardHover = Color.FromArgb(48, 35, 28);
    public static readonly Color SurfaceCardActive = Color.FromArgb(56, 39, 27);
    public static readonly Color SurfaceRecessed = Color.FromArgb(16, 11, 9);
    public static readonly Color BorderOuter = Color.FromArgb(84, 60, 46);
    public static readonly Color BorderSubtle = Color.FromArgb(62, 45, 36);
    public static readonly Color BorderHover = Color.FromArgb(118, 86, 66);
    public static readonly Color AccentHoney = Color.FromArgb(232, 169, 98);
    public static readonly Color AccentHoneyBright = Color.FromArgb(244, 188, 122);
    public static readonly Color AccentCoral = Color.FromArgb(224, 94, 74);
    public static readonly Color InkPrimary = Color.FromArgb(247, 238, 226);
    public static readonly Color InkSecondary = Color.FromArgb(196, 174, 152);
    public static readonly Color InkMuted = Color.FromArgb(136, 114, 96);
    public static readonly Color InkDisabled = Color.FromArgb(112, 92, 78);
    public static readonly Color InkOnAccent = Color.FromArgb(31, 20, 13);

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
        Cursor = Cursors.Hand;
        Height = isHeaderTab ? 32 : 34;
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
            string key = _items[idx].Key;
            if (!string.Equals(_selectedKey, key, StringComparison.OrdinalIgnoreCase))
            {
                _selectedKey = key;
                Invalidate();
                SelectionChanged?.Invoke(key);
            }
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

        RectangleF outerRect = new(0.5f, 0.5f, Width - 1f, Height - 1f);
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

        using Font activeFont = new("Segoe UI", _isHeaderTab ? 8.5f : 8.75f, FontStyle.Bold, GraphicsUnit.Point);
        using Font normalFont = new("Segoe UI", _isHeaderTab ? 8.5f : 8.75f, FontStyle.Regular, GraphicsUnit.Point);
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
        Cursor = Cursors.Hand;
        Size = new Size(156, 54);
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

        // Visual mini-scene thumbnail swatch on the left
        RectangleF swatchRect = new(9f, (Height - 34f) * 0.5f, 34f, 34f);
        using (GraphicsPath swatchPath = ModernTheme.CreateRoundedRect(swatchRect, 8f))
        using (SolidBrush floorBrush = new(_floorColor))
        using (Pen swatchBorder = new(Color.FromArgb(90, 255, 255, 255), 1f))
        {
            g.FillPath(floorBrush, swatchPath);
            g.DrawPath(swatchBorder, swatchPath);
        }

        // Inner rug miniature
        RectangleF innerRug = new(swatchRect.X + 5f, swatchRect.Y + 8f, 20f, 18f);
        using (GraphicsPath rugPath = ModernTheme.CreateRoundedRect(innerRug, 4f))
        using (SolidBrush rugBrush = new(_rugColor))
        {
            g.FillPath(rugBrush, rugPath);
        }

        // Prop accent badge dot inside swatch
        using (SolidBrush propBrush = new(_propAccentColor))
        {
            g.FillEllipse(propBrush, swatchRect.Right - 11f, swatchRect.Y + 4f, 7f, 7f);
        }

        // Active indicator dot in top-right corner
        if (_selected)
        {
            using SolidBrush activeDotBrush = new(ModernTheme.AccentHoney);
            g.FillEllipse(activeDotBrush, Width - 14f, 8f, 6f, 6f);
        }

        // Title & Subtitle
        using Font titleFont = new("Segoe UI", 9.25f, FontStyle.Bold, GraphicsUnit.Point);
        using Font subFont = new("Segoe UI", 7.5f, FontStyle.Regular, GraphicsUnit.Point);
        using SolidBrush titleBrush = new(_selected ? ModernTheme.AccentHoneyBright : ModernTheme.InkPrimary);
        using SolidBrush subBrush = new(ModernTheme.InkSecondary);

        float textX = swatchRect.Right + 8f;
        g.DrawString(_title, titleFont, titleBrush, new PointF(textX, 9f));
        g.DrawString(_subtitle, subFont, subBrush, new PointF(textX, 28f));
    }
}

internal sealed class ModernStepperCard : Control
{
    private readonly string _title;
    private readonly string _unitSuffix;
    private readonly int _min;
    private readonly int _max;
    private int _value;
    private int _hoveredPart; // 0 = none, 1 = minus, 2 = plus

    public event Action<int>? ValueChanged;

    public ModernStepperCard(string title, int min, int max, int initialValue, string unitSuffix = "")
    {
        _title = title;
        _min = min;
        _max = max;
        _value = Math.Clamp(initialValue, min, max);
        _unitSuffix = unitSuffix;

        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
        Height = 48;
    }

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

    private RectangleF GetMinusRect() => new(Width - 108f, (Height - 28f) * 0.5f, 28f, 28f);
    private RectangleF GetValueRect() => new(Width - 76f, (Height - 28f) * 0.5f, 40f, 28f);
    private RectangleF GetPlusRect() => new(Width - 32f, (Height - 28f) * 0.5f, 24f, 28f);

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

        Cursor = (nextPart == 1 && _value > _min) || (nextPart == 2 && _value < _max)
            ? Cursors.Hand
            : Cursors.Default;

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

        if (GetMinusRect().Contains(e.Location) && _value > _min)
        {
            _value--;
            Invalidate();
            ValueChanged?.Invoke(_value);
        }
        else if (GetPlusRect().Contains(e.Location) && _value < _max)
        {
            _value++;
            Invalidate();
            ValueChanged?.Invoke(_value);
        }
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

        // Left title + progress meter bar
        using Font titleFont = new("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point);
        using SolidBrush titleBrush = new(ModernTheme.InkPrimary);
        g.DrawString(_title, titleFont, titleBrush, new PointF(12f, 8f));

        // Mini fill bar under title
        float meterX = 12f;
        float meterY = 31f;
        float meterW = Math.Max(48f, Width - 134f);
        float meterH = 5f;
        RectangleF meterTrack = new(meterX, meterY, meterW, meterH);
        using (GraphicsPath trackPath = ModernTheme.CreateRoundedRect(meterTrack, 2.5f))
        using (SolidBrush trackBrush = new(ModernTheme.SurfaceRecessed))
        {
            g.FillPath(trackBrush, trackPath);
        }

        float ratio = _max > _min ? (float)(_value - _min) / (_max - _min) : 1f;
        float fillW = Math.Max(6f, meterW * Math.Clamp(ratio, 0f, 1f));
        RectangleF meterFill = new(meterX, meterY, fillW, meterH);
        using (GraphicsPath fillPath = ModernTheme.CreateRoundedRect(meterFill, 2.5f))
        using (SolidBrush fillBrush = new(ModernTheme.AccentHoney))
        {
            g.FillPath(fillBrush, fillPath);
        }

        // Stepper buttons on right (using vector lines so '-' and '+' are always crisp & high-contrast)
        RectangleF minusRect = new(Width - 108f, (Height - 28f) * 0.5f, 28f, 28f);
        RectangleF valRect = new(Width - 76f, (Height - 28f) * 0.5f, 38f, 28f);
        RectangleF plusRect = new(Width - 36f, (Height - 28f) * 0.5f, 28f, 28f);

        bool canDec = _value > _min;
        bool canInc = _value < _max;

        DrawStepButton(g, minusRect, isPlus: false, enabled: canDec, hovered: _hoveredPart == 1 && canDec);
        DrawStepButton(g, plusRect, isPlus: true, enabled: canInc, hovered: _hoveredPart == 2 && canInc);

        // Center value pill
        using (GraphicsPath valPath = ModernTheme.CreateRoundedRect(valRect, 7f))
        using (SolidBrush valBg = new(ModernTheme.SurfaceRecessed))
        using (Pen valBorder = new(ModernTheme.BorderSubtle, 1f))
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
        };
        string display = string.IsNullOrEmpty(_unitSuffix) ? $"{_value}" : $"{_value}{_unitSuffix}";
        g.DrawString(display, valFont, valTextBrush, valRect, sf);
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
        using Pen glyphPen = new(glyph, 1.85f)
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

internal sealed class ModernActionChip : Control
{
    private string _label;
    private bool _active;
    private bool _useCoralAccent;
    private bool _hovered;
    private bool _pressed;

    public ModernActionChip(string label, bool useCoralAccent = false)
    {
        _label = label;
        _useCoralAccent = useCoralAccent;
        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw |
            ControlStyles.Selectable,
            true);
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
            rect.Inflate(-0.5f, -0.5f);
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

        if (_active && _useCoralAccent)
        {
            using SolidBrush dotBrush = new(ModernTheme.AccentCoral);
            g.FillEllipse(dotBrush, 11f, (Height - 7f) * 0.5f, 7f, 7f);
        }

        using Font font = new("Segoe UI", 8.75f, _active ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);
        using SolidBrush fgBrush = new(fg);
        using StringFormat sf = new()
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            FormatFlags = StringFormatFlags.NoWrap,
        };
        g.DrawString(_label, font, fgBrush, rect, sf);
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
        Cursor = Cursors.Hand;
        Height = string.IsNullOrEmpty(subtitle) ? 38 : 48;
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
            _checked = !_checked;
            Invalidate();
            CheckedChanged?.Invoke(_checked);
        }
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

        // Title & Subtitle
        using Font titleFont = new("Segoe UI", 8.75f, FontStyle.Bold, GraphicsUnit.Point);
        using SolidBrush titleBrush = new(ModernTheme.InkPrimary);
        if (string.IsNullOrEmpty(_subtitle))
        {
            g.DrawString(_title, titleFont, titleBrush, new PointF(12f, (Height - 16f) * 0.5f));
        }
        else
        {
            using Font subFont = new("Segoe UI", 7.5f, FontStyle.Regular, GraphicsUnit.Point);
            using SolidBrush subBrush = new(ModernTheme.InkSecondary);
            g.DrawString(_title, titleFont, titleBrush, new PointF(12f, 7f));
            g.DrawString(_subtitle, subFont, subBrush, new PointF(12f, 25f));
        }

        // Pill toggle switch on the right
        float switchW = 38f;
        float switchH = 20f;
        RectangleF switchRect = new(Width - switchW - 12f, (Height - switchH) * 0.5f, switchW, switchH);
        Color trackColor = _checked ? ModernTheme.AccentHoney : ModernTheme.SurfaceRecessed;
        Color trackBorder = _checked ? ModernTheme.AccentHoneyBright : ModernTheme.BorderHover;

        using (GraphicsPath switchPath = ModernTheme.CreateRoundedRect(switchRect, switchH * 0.5f))
        using (SolidBrush trackBrush = new(trackColor))
        using (Pen trackPen = new(trackBorder, 1f))
        {
            g.FillPath(trackBrush, switchPath);
            g.DrawPath(trackPen, switchPath);
        }

        float thumbSize = 14f;
        float thumbX = _checked ? (switchRect.Right - thumbSize - 3f) : (switchRect.X + 3f);
        float thumbY = switchRect.Y + (switchH - thumbSize) * 0.5f;
        Color thumbColor = _checked ? ModernTheme.InkOnAccent : ModernTheme.InkSecondary;

        using (SolidBrush thumbBrush = new(thumbColor))
        {
            g.FillEllipse(thumbBrush, thumbX, thumbY, thumbSize, thumbSize);
        }
    }
}
