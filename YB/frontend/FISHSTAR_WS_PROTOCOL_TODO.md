# FishStar WebSocket 字段统一改造

后端现在只认统一字段名,不要再发送兼容别名。

## 统一字段

- 开炮标识: `fireToken`
- 命中鱼 ID: `fishId`
- 下注/炮档: `fire`

## 开炮消息

客户端发送 `msgId=1005`:

```json
{
  "msgId": 1005,
  "data": {
    "fire": 10,
    "angle": 90
  }
}
```

后端返回 `msgId=1005`,并广播 `msgId=1015`:

```json
{
  "msgId": 1005,
  "data": {
    "fireToken": "fs_1710000000000_1",
    "fire": 10,
    "newCoin": 9990
  }
}
```

前端必须保存这次开炮返回的 `fireToken`。

## 命中消息

客户端发送 `msgId=1006` 或 `msgId=1016` 时必须带:

```json
{
  "msgId": 1006,
  "data": {
    "fireToken": "fs_1710000000000_1",
    "fishId": 100123,
    "userId": "40001535"
  }
}
```

`fishId` 来自后端刷鱼消息 `msgId=1004` 里的鱼对象 `id` 字段。前端发送命中时统一改名为 `fishId`。

## 移除鱼消息

后端发送 `msgId=1003` 时统一只带 `fishId`:

```json
{
  "msgId": 1003,
  "data": {
    "fishId": 100123
  }
}
```

前端收到后移除对应鱼实例。`reason: "expired"` 表示鱼自然游出/过期,可以忽略。

## 不再使用

- 不要用 `token` 表示开炮标识。
- 不要用 `id` / `fishID` / `fish_id` / `targetFishId` 表示命中鱼。
- 不要用 `fire_token` / `bulletId` / `shotId` 表示开炮标识。
- 不要在 `msgId=1003` 里依赖 `ids` 或 `id`。

如果前端继续发送旧字段,后端会按缺少 `fireToken` 或 `fishId` 处理,鱼不会被击杀。
