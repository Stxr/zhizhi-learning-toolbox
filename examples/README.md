# 本地清单示例

以下是合成文章清单模板，不包含第三方正文或真实路径。将 UTF-8 自建文章放在 `.local/catalogs/example-course/articles/introduction.md`，用文件实际 SHA256 替换模板占位符，将清单保存为 `.local/catalogs/example-course.json`。

```json
{
  "schemaVersion": 2,
  "collection": {
    "id": "example-course",
    "title": "自建示例课程",
    "year": 2026,
    "sourceUrl": "https://example.com/course"
  },
  "items": [{
    "lessonId": "example-course-2026-001",
    "order": 1,
    "kind": "article",
    "title": "自建入门正文",
    "year": 2026,
    "sourceUrl": "https://example.com/course/introduction",
    "documentFile": "articles/introduction.md",
    "documentSha256": "替换为真实文件的64位小写SHA256"
  }]
}
```

只在本机使用登记接口（会将正文加入本地学习数据，并在启用的队列中使用 Codex 额度整理）：

```bash
curl -X POST http://127.0.0.1:4387/api/collections/register-v2 \
  -H 'Content-Type: application/json' -H 'X-Learning-Toolbox: 1' \
  --data '{"catalogId":"example-course"}'
```

文章清单的年份必须一致，lessonId必须以collection id开头；正文文件必须位于该清单子目录，类型、大小、路径和SHA均校验。重复登记保留相同内容，不覆盖改变的来源。

远端视频条目还需要 `videoSha256`、`duration`、`sizeBytes`、`remotePath`、`streamAssetId` 和 `subtitles`，仅允许环境变量 `LEARNING_REMOTE_ROOT` 指定的固定 Windows 根目录。实际 worker 和只读代理需自行准备；没有远端素材时不要登记虚构的成功结果。
