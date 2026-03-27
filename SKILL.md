# React Native Performance Doctor

## 概述

自动诊断和修复 React Native 应用的性能问题，包括 List 卡顿、内存泄漏、启动慢、帧率低等。

## 激活条件

当用户提及以下关键词时自动激活：
- react-native 性能问题
- 卡顿、帧率低
- 内存泄漏
- 启动慢
- list 滚动卡
- FlatList 优化
- ANR
- memory leak
- react-native performance

## 核心功能

### 1. 性能诊断

自动分析代码中的性能问题，包括：
- List/FlatList 配置检查
- 渲染优化检查
- 内存泄漏检测
- 启动性能分析
- 图片优化建议
- New Architecture 兼容性检查

### 2. 自动修复

- 生成优化后的代码
- 提供配置建议
- 给出修复示例

### 3. 性能基准

- 帧率检测
- 内存使用分析
- 启动时间评估

---

## 诊断规则库

### 一、List 性能规则 (15 条)

#### RN-LIST-01: FlatList 缺少 getItemLayout
- **优先级**: 高 🔴
- **问题**: 未使用固定高度，滚动时重复计算布局
- **修复**: 添加 getItemLayout 回调
```tsx
const ITEM_HEIGHT = 80;
const getItemLayout = (data, index) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
});
<FlatList getItemLayout={getItemLayout} />
```

#### RN-LIST-02: FlatList 缺少 keyExtractor
- **优先级**: 高 🔴
- **问题**: 使用默认索引作为 key，导致 diff 失效
- **修复**: 提供唯一的 keyExtractor
```tsx
<FlatList
  data={items}
  keyExtractor={(item) => item.id}
/>
```

#### RN-LIST-03: FlatList removeClippedSubviews={false}
- **优先级**: 高 🔴
- **问题**: 关闭虚拟化，所有 item 持续渲染
- **修复**: 启用虚拟化
```tsx
<FlatList removeClippedSubviews={true} />
```

#### RN-LIST-04: ListItem 未使用 React.memo
- **优先级**: 高 🔴
- **问题**: 父组件渲染导致子组件不必要重绘
- **修复**: 使用 React.memo 包装
```tsx
const ListItem = React.memo(({ data }) => {
  return <View>{data.title}</View>;
});
```

#### RN-LIST-05: ListItem 内使用内联函数作为 prop
- **优先级**: 中 🟡
- **问题**: `onPress={() => handlePress(id)}` 每次创建新函数
- **修复**: 使用 useCallback 或 useRef
```tsx
const handlePress = useCallback((id) => {
  onItemPress(id);
}, [onItemPress]);

// 在 render 中
onPress={handlePress}
```

#### RN-LIST-06: FlatList windowSize 设置过大
- **优先级**: 中 🟡
- **问题**: 默认 21，可能导致过度渲染
- **修复**: 根据可见区域调整
```tsx
<FlatList windowSize={5} />
```

#### RN-LIST-07: SectionList stickySectionHeadersEnabled
- **优先级**: 中 🟡
- **问题**: sticky headers 有性能开销
- **修复**: 不需要时关闭
```tsx
<SectionList stickySectionHeadersEnabled={false} />
```

#### RN-LIST-08: List 中 Image 未指定尺寸
- **优先级**: 中 🟡
- **问题**: 加载时导致布局抖动
- **修复**: 指定固定宽高
```tsx
<Image source={img} style={{ width: 100, height: 100 }} />
```

#### RN-LIST-09: 大量数据未做分页/懒加载
- **优先级**: 高 🔴
- **问题**: 一次渲染所有数据
- **修复**: 实现分页加载
```tsx
const [data, setData] = useState([]);
const loadMore = () => {
  const newData = await fetchPage(page + 1);
  setData(prev => [...prev, ...newData]);
};
```

#### RN-LIST-10: initialNumToRender 未优化
- **优先级**: 中 🟡
- **问题**: 默认渲染数量过多
- **修复**: 减少初始渲染数量
```tsx
<FlatList initialNumToRender={10} />
```

#### RN-LIST-11: ListItem 嵌套深层组件
- **优先级**: 中 🟡
- **问题**: 嵌套层级 > 5 层影响性能
- **修复**: 扁平化组件结构

#### RN-LIST-12: 使用 FlatList 渲染少量数据 (< 20)
- **优先级**: 低 🟢
- **问题**: 不需要虚拟化，开销更大
- **修复**: 使用 ScrollView 或 map

#### RN-LIST-13: useCallback 过度使用
- **优先级**: 低 🟢
- **问题**: 每个 Item 都用，但依赖未稳定
- **修复**: 评估是否真正需要

#### RN-LIST-14: FlatList 缺少 maxToRenderPerBatch
- **优先级**: 中 🟡
- **问题**: 未限制批量渲染数量
- **修复**: 设置合理的批量大小
```tsx
<FlatList maxToRenderPerBatch={10} />
```

#### RN-LIST-15: 动态高度列表未实现 getItemLayout
- **优先级**: 高 🔴
- **问题**: 动态高度无法预计算
- **修复**: 估算高度或使用异步测量

---

### 二、渲染性能规则 (12 条)

#### RN-RENDER-01: 组件未使用 React.memo
- **优先级**: 高 🔴
- **问题**: 父组件渲染导致子组件不必要重绘
- **修复**: 使用 React.memo

#### RN-RENDER-02: useMemo 用于原始类型
- **优先级**: 中 🟡
- **问题**: 开销大于收益
- **修复**: 直接使用原始值

#### RN-RENDER-03: useCallback 依赖数组包含对象/数组
- **优先级**: 高 🔴
- **问题**: 每次渲染创建新依赖
- **修复**: 使用 useRef 存储稳定引用
```tsx
const onPressRef = useRef(onPress);
onPressRef.current = onPress;

const handlePress = useCallback((id) => {
  onPressRef.current(id);
}, []);
```

#### RN-RENDER-04: Render 中使用 new Date()
- **优先级**: 中 🟡
- **问题**: 每次渲染创建新实例
- **修复**: 在组件外或 useMemo 中创建

#### RN-RENDER-05: 组件内定义子组件
- **优先级**: 高 🔴
- **问题**: `const Child = () => <View />` 每次重定义
- **修复**: 提取到组件外或使用 useCallback

#### RN-RENDER-06: Style 使用对象字面量
- **优先级**: 中 🟡
- **问题**: `style={{margin: 10}}` 每次创建新对象
- **修复**: 使用 useStyle 或 const 定义
```tsx
const styles = StyleSheet.create({
  container: { margin: 10 }
});
// 在 render 中
style={styles.container}
```

#### RN-RENDER-07: 条件渲染使用 && 渲染 0
- **优先级**: 低 🟢
- **问题**: 显示 "0" 而非空
- **修复**: 使用三元运算符或 &&

#### RN-RENDER-08: View 嵌套层级过深
- **优先级**: 中 🟡
- **问题**: 嵌套层级 > 8 层
- **修复**: 扁平化结构，使用 Flex 布局

#### RN-RENDER-09: Animated.View 未使用 useNativeDriver
- **优先级**: 高 🔴
- **问题**: 动画在 JS 线程执行
- **修复**: 启用 native driver
```tsx
Animated.timing(value, {
  useNativeDriver: true,
  // ...
}).start();
```

#### RN-RENDER-10: setState 在 render 中调用
- **优先级**: 高 🔴
- **问题**: 导致无限循环
- **修复**: 移到 useEffect 或事件处理中

#### RN-RENDER-11: useEffect 中调用 setState 无依赖
- **优先级**: 中 🟡
- **问题**: 可能导致连续渲染
- **修复**: 添加正确的依赖数组

#### RN-RENDER-12: React 19 下仍使用大量 useMemo/useCallback
- **优先级**: 中 🟡
- **问题**: React Compiler 已自动优化
- **修复**: 移除不必要的 memoization

---

### 三、内存与泄漏规则 (10 条)

#### RN-MEMORY-01: useEffect 缺少 cleanup 函数
- **优先级**: 高 🔴
- **问题**: EventListener、Timer 未清理
- **修复**: 返回 cleanup 函数
```tsx
useEffect(() => {
  const subscription = subscribe(data);
  return () => subscription.unsubscribe();
}, []);
```

#### RN-MEMORY-02: setInterval/setTimeout 未 clear
- **优先级**: 高 🔴
- **问题**: 组件卸载后继续运行
- **修复**: 在 cleanup 中清除
```tsx
useEffect(() => {
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer);
}, []);
```

#### RN-MEMORY-03: 闭包引用大型对象
- **优先级**: 中 🟡
- **问题**: 闭包持有大型数据导致内存增长
- **修复**: 使用 useRef 存储

#### RN-MEMORY-04: 全局变量存储数据
- **优先级**: 高 🔴
- **问题**: 无法被垃圾回收
- **修复**: 使用组件状态或 Context

#### RN-MEMORY-05: Context 嵌套过深
- **优先级**: 中 🟡
- **问题**: 每层渲染都有开销
- **修复**: 使用 Context 拆分或 useContextSelector

#### RN-MEMORY-06: Image 加载大图未压缩
- **优先级**: 中 🟡
- **问题**: 内存占用过高
- **修复**: 使用合适尺寸的图片

#### RN-MEMORY-07: 大量 useState 创建对象
- **优先级**: 中 🟡
- **问题**: 每次创建新引用
- **修复**: 使用 useReducer 或合并状态

#### RN-MEMORY-08: Redux/状态库未使用 selectors
- **优先级**: 中 🟡
- **问题**: 每次 state 变化触发所有订阅
- **修复**: 使用 memoized selectors

#### RN-MEMORY-09: 循环中创建组件
- **优先级**: 中 🟡
- **问题**: `arr.map(() => <HeavyComponent />` 
- **修复**: 优化组件结构，避免重复渲染

#### RN-MEMORY-10: 未使用的 import/变量
- **优先级**: 低 🟢
- **问题**: bundle 体积增加
- **修复**: 清理未使用代码

---

### 四、启动性能规则 (8 条)

#### RN-BOOT-01: App Registry 外层组件过多
- **优先级**: 高 🔴
- **问题**: 首屏渲染链路长
- **修复**: 减少根组件层级

#### RN-BOOT-02: 启动时加载大型数据
- **优先级**: 高 🔴
- **问题**: 阻塞首屏
- **修复**: 延迟加载或骨架屏

#### RN-BOOT-03: 首屏使用 complex 动画
- **优先级**: 中 🟡
- **问题**: 延迟渲染
- **修复**: 简化或延迟动画

#### RN-BOOT-04: 图片未预加载
- **优先级**: 中 🟡
- **问题**: 首页图片延迟显示
- **修复**: 使用 Image.prefetch

#### RN-BOOT-05: 路由未使用 lazy loading
- **优先级**: 高 🔴
- **问题**: 一次性加载全部 JS
- **修复**: 使用 lazy 和 Suspense
```tsx
const Settings = React.lazy(() => import('./Settings'));

<Suspense fallback={<Loading />}>
  <Settings />
</Suspense>
```

#### RN-BOOT-06: Hermes 未启用
- **优先级**: 高 🔴
- **问题**: 使用老版本 JS 引擎
- **修复**: 启用 Hermes
```gradle
// android/app/build.gradle
project.ext.react = [
  hermesEnabled: true
]
```

#### RN-BOOT-07: 未使用 Hermes bytecode
- **优先级**: 中 🟡
- **问题**: 未预编译 JS
- **修复**: 配置 hermesc 编译

#### RN-BOOT-08: entry point 同步调用耗时操作
- **优先级**: 中 🟡
- **问题**: 初始化阻塞
- **修复**: 异步化初始化

---

### 五、图片与媒体规则 (8 条)

#### RN-IMAGE-01: Image 未指定宽高
- **优先级**: 中 🟡
- **问题**: 需要二次计算
- **修复**: 指定固定宽高

#### RN-IMAGE-02: 使用网络图片未缓存
- **优先级**: 高 🔴
- **问题**: 每次重新下载
- **修复**: 使用缓存库或配置
```tsx
import { CachedImage } from 'react-native-image-cache';
<CachedImage source={{ uri }} />
```

#### RN-IMAGE-03: 使用 resizeMode="stretch"
- **优先级**: 中 🟡
- **问题**: 缩放性能差
- **修复**: 使用 cover 或 contain

#### RN-IMAGE-04: 大图未做尺寸适配
- **优先级**: 中 🟡
- **问题**: 加载原图浪费内存
- **修复**: 使用 CDN 裁剪

#### RN-IMAGE-05: 使用动态 require 路径
- **优先级**: 中 🟡
- **问题**: 无法优化
- **修复**: 使用对象 URI 方式

#### RN-IMAGE-06: 视频/音频未使用缓存
- **优先级**: 中 🟡
- **问题**: 重复加载
- **修复**: 实现媒体缓存

#### RN-IMAGE-07: 背景图使用 Image 组件
- **优先级**: 中 🟡
- **问题**: 覆盖整个屏幕开销大
- **修复**: 使用 ImageBackground

#### RN-IMAGE-08: 未使用 blurhash 占位
- **优先级**: 低 🟢
- **问题**: 加载时白屏
- **修复**: 使用 blurhash 占位

---

### 六、新架构规则 (8 条)

#### RN-NEWARCH-01: 仍使用 Legacy Bridge 模块
- **优先级**: 高 🔴
- **问题**: 未迁移到 TurboModules
- **修复**: 迁移到 TurboModules

#### RN-NEWARCH-02: Native Module 使用同步调用
- **优先级**: 中 🟡
- **问题**: 阻塞 JS 线程
- **修复**: 使用异步调用

#### RN-NEWARCH-03: 未使用 codegenConfig
- **优先级**: 中 🟡
- **问题**: 无法享受类型安全优化
- **修复**: 配置 codegen

#### RN-NEWARCH-04: Fabric 组件未使用 forwardRef
- **优先级**: 中 🟡
- **问题**: 无法使用新渲染器特性
- **修复**: 使用 forwardRef

#### RN-NEWARCH-05: Event emitter 未迁移到 TurboModule
- **优先级**: 中 🟡
- **问题**: 性能不如新架构
- **修复**: 迁移到新 API

#### RN-NEWARCH-06: 旧版 LayoutAnimation
- **优先级**: 低 🟢
- **问题**: 未使用新 API
- **修复**: 使用新 API

#### RN-NEWARCH-07: useNativeDriver 未启用
- **优先级**: 高 🔴
- **问题**: 动画性能差
- **修复**: 启用 native driver

#### RN-NEWARCH-08: 未使用 React.strictMode
- **优先级**: 低 🟢
- **问题**: 无法识别潜在问题
- **修复**: 启用 StrictMode
```tsx
<StrictMode>
  <App />
</StrictMode>
```

---

### 七、配置与工具规则 (6 条)

#### RN-CONFIG-01: babel.config.js 未优化
- **优先级**: 中 🟡
- **问题**: 未配置 tree-shaking
- **修复**: 配置优化插件

#### RN-CONFIG-02: metro.config.js 未做 bundle 优化
- **优先级**: 中 🟡
- **问题**: 产物过大
- **修复**: 配置 minifier

#### RN-CONFIG-03: App 未配置 splash screen
- **优先级**: 低 🟢
- **问题**: 启动体验差
- **修复**: 配置启动屏

#### RN-CONFIG-04: Hermes flags 未优化
- **优先级**: 中 🟡
- **问题**: 编译未启用优化
- **修复**: 配置优化参数

#### RN-CONFIG-05: iOS release 未启用 bitcode
- **优先级**: 低 🟢
- **问题**: 产物更大
- **修复**: 启用 bitcode

#### RN-CONFIG-06: Android 未启用 R8 优化
- **优先级**: 低 🟢
- **问题**: 产物未压缩
- **修复**: 配置 R8

---

## 输出格式

诊断完成后，输出以下格式的报告：

```
🔍 React Native 性能诊断报告

═══════════════════════════════════════
发现 X 个问题
═══════════════════════════════════════

🔴 高优先级 (X 个)
├─ RN-LIST-01: [文件] FlatList 缺少 getItemLayout
├─ RN-RENDER-01: [文件] 组件未使用 React.memo
└─ ...

🟡 中优先级 (X 个)
├─ RN-LIST-05: [文件] 内联函数作为 prop
└─ ...

🟢 低优先级 (X 个)
└─ ...

═══════════════════════════════════════
修复建议
═══════════════════════════════════════

1. [高] FlatList 优化
   代码位置: src/screens/Home.tsx:45
   建议: 添加 getItemLayout
   预期效果: 滚动帧率提升 30%

2. [中] React.memo 包装
   代码位置: src/components/ListItem.tsx:12
   建议: 使用 React.memo
   预期效果: 减少不必要渲染

═══════════════════════════════════════
自动修复
═══════════════════════════════════════

是否需要我自动应用这些修复？ (y/n)
```

---

## 使用示例

### 示例 1: List 卡顿诊断
```
用户: 我的 FlatList 滚动很卡
Skill: 分析代码，提供诊断报告和修复建议
```

### 示例 2: 内存泄漏检测
```
用户: 切换页面后内存一直涨
Skill: 检测 useEffect cleanup 缺失，给出修复代码
```

### 示例 3: 启动优化
```
用户: App 启动很慢
Skill: 分析入口文件，提供启动优化建议
```

### 示例 4: 新架构兼容性
```
用户: 迁移到 RN 0.76 后性能下降
Skill: 检测 Legacy Bridge 使用，建议 TurboModules 迁移
```

---

## 注意事项

1. 优先处理高优先级问题
2. React 19 环境下的 useMemo/useCallback 规则需要特殊处理
3. New Architecture (Fabric/TurboModules) 已成为默认，需要特别关注
4. 移动端性能与 iOS/Android 平台相关，需考虑平台差异

---

## 适用版本

- React Native 0.76+
- Expo SDK 52+
- React 19 (with Compiler)
- New Architecture (Fabric + TurboModules)