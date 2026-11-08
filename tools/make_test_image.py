"""生成一张中文合同测试图片（用于验证 VL 模型读图能力）。"""
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 900, 620
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

font = None
for p in ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/simhei.ttf"]:
    if os.path.exists(p):
        font = ImageFont.truetype(p, 26)
        break

# 注意法律口径：合同期限必须是「两年」。
# 《劳动合同法》第19条「三年以上固定期限」含本数，三年合同约定六个月试用期是合法的；
# 用三年会变成合规条款，系统正确地不报风险，就没法演示「试用期超限」了。
lines = [
    "劳动合同书",
    "",
    "第一条 本合同为固定期限劳动合同，合同期限为两年，",
    "自2026年1月1日起至2027年12月31日止，其中试用期六个月。",
    "试用期工资为每月2000元，转正后每月8000元。",
    "",
    "第二条 乙方自愿放弃缴纳社会保险，甲方将相应费用",
    "直接计入乙方工资。",
    "",
    "第三条 甲方每月10日以货币形式足额支付乙方工资。",
]
y = 40
for ln in lines:
    d.text((60, y), ln, fill="black", font=font)
    y += 48

out = os.environ.get("TEMP", ".") + "/test_contract.jpg"
img.save(out, quality=88)
print("已生成:", out, os.path.getsize(out), "bytes")
