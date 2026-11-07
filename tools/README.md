# tools/ —— 开发期验证脚本

这些脚本不进主流程，只用于**选型和验证**，保留下来是为了让技术选择可复现
（面试/评审被问「你为什么用这个视觉模型」时，能直接跑一遍给出数据）。

| 脚本 | 用途 |
|---|---|
| `list_models.py` | 列出当前 API Key 可用的模型。硅基流动的模型下线很快，报 403 `Model disabled` 时先用它确认真实可用名 |
| `test_vl.py` | 用同一张中文合同图横向对比候选视觉模型的识别结果与耗时，作为选型依据 |
| `make_test_image.py` | 生成中文合成合同图片，作为 OCR 准确率测试的固定素材 |

## 选型结论（2026-11）

候选模型在同一张合同图上全部识别正确，最终选 **`Qwen/Qwen3-VL-30B-A3B-Instruct`**：

- 10 秒内完成一页识别（MoE 结构，30B 总参 / 3B 激活，比稠密 32B 快）
- 逐字转写准确，条款编号与换行保留完好，可直接进 `split_clauses` 切分
- 同 key 下可用，无需额外开通

注意：`Qwen2.5-VL` 系列在硅基流动已下线，写死旧模型名会直接 403。

## 用法

```bash
conda activate laborai
python tools/list_models.py
python tools/make_test_image.py
python tools/test_vl.py
```

需要 `.env` 里有 `LLM_API_KEY`（硅基流动）。
