#!/usr/bin/env python3
"""Tab Harbor のツールバー/ストア用アイコンを生成する。

錨(anchor)を紺色の角丸タイルに描く。4x スーパーサンプリングで描画して
縮小することでエッジを滑らかにする。

usage: python3 scripts/gen_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
BG = (18, 59, 92, 255)        # 深い港の紺
FG = (234, 246, 255, 255)     # 明るいオフホワイト
OUT_DIR = Path(__file__).resolve().parent.parent / "icons"


def draw_anchor(scale: int) -> Image.Image:
    """scale=1 で 128px 相当の座標系に描画する。"""
    s = 128 * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def p(x, y):
        return (x * scale, y * scale)

    # 角丸タイル
    d.rounded_rectangle([p(0, 0), p(128, 128)], radius=28 * scale, fill=BG)

    w = 8 * scale  # 線の太さ

    # リング(上部の輪)
    d.ellipse([p(52, 16), p(76, 40)], outline=FG, width=w)
    # シャフト(縦棒)
    d.line([p(64, 40), p(64, 104)], fill=FG, width=w)
    # クロスバー(横棒)
    d.line([p(40, 56), p(88, 56)], fill=FG, width=w)
    # 底部のアーム(円弧)
    d.arc([p(28, 44), p(100, 116)], start=25, end=155, fill=FG, width=w)
    # アームの先端(フルーク)
    d.polygon([p(24, 84), p(40, 78), p(38, 96)], fill=FG)
    d.polygon([p(104, 84), p(88, 78), p(90, 96)], fill=FG)

    return img


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    base = draw_anchor(scale=4)  # 512px で描いて縮小
    for size in SIZES:
        icon = base.resize((size, size), Image.LANCZOS)
        path = OUT_DIR / f"icon{size}.png"
        icon.save(path)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
