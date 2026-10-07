# LEXY莱克 微信小程序 一手拆解底稿（真实数据）
采集时间：2026-10-07 | 方式：PC 微信本地缓存 wxapkg 解密解包（V1MMWX → PBKDF2+AES+XOR）

## 基本信息（实测）
- 小程序 AppID：wx6bc687ff89875e20（图标已确认为 LEXY莱克）
- 技术底座：有赞（Youzan）零售小程序模板，kdtId=44375018，连锁店铺模式（isChainStore=true）
- 线上版本：userVersion 3.179.7.101（本地缓存包版本 61）
- 主包大小：5.30MB（5302580 字节），主包文件 529 个，子包目录 82 个
- 入口页：pages/home/dashboard/index
- 渲染器：webview（exparser 组件框架），非 Skyline

## tabBar（实测 3 栏，custom:true 自定义导航）
1. 首页 → pages/home/dashboard/index
2. 购物车 → pages/goods/cart/index
3. 我的 → pages-retail/usercenter/dashboard-v2/index
- 主题色：selectedColor #FF4444（红），背景 #FCFCFC

## 页面规模
- 主包 pages 注册 452 个页面（含分包页面平铺），82 个分包
- 核心一级路径：pages/home、pages/goods、pages/trade、pages/pay、pages/usercenter、pages/membercard、pages/ump
- 关键分包：packages/goods、trade-buy（下单）、trade（订单/售后/refund）、pointstore（积分商城：首页/兑换/积分明细/规则/流水）、user（优惠券/积分/返现/任务中心）、membercard+card+benefit-card+levelcenter（会员卡/权益/等级）、ump（营销：拼团 pintuan、秒杀通过直播插件、砍价 helpcut、礼包 gift、签到 sign-in、盲盒 blind-box、抽奖 lottery、赠品 presents 等）、salesman/guide/channel（分销员/导购/渠道）、groupbuying（社区团购）、retail/retail-shelf/retailb（门店零售：扫码购 scan-code-buy、门店货架、自提）、shop-select/chain-store/multi-store（连锁门店选择/多门店）、weapp-live + 直播插件、wxvideo（微信视频号带货）、paidcontent/edu（付费内容/教育，模板自带）、hotel（酒店，模板自带）、point/new-punch（积分/打卡）

## 插件（实测）
- live-player-plugin：wx2b03c6e691cd7370 v1.3.2（微信官方小程序直播）
- yzVideoPlugin：wx9e5eba73bf23a27a v1.4.3（有赞视频插件）

## 首页可用装修模块（dc-* 组件注册表，实际展示由有赞后台远程配置）
dc-search(搜索)、dc-notice(公告)、dc-image(图片广告)、dc-goods(商品)、dc-goods-tabs(商品Tab)、dc-coupon(优惠券)、dc-live(直播)、dc-wxvideo-live(视频号直播)、dc-member(会员)、dc-shop/dc-store/dc-enter-shop(店铺/门店)、dc-cube(魔方)、dc-column、dc-rich-text、dc-title-text、dc-hot-words、dc-fans、dc-present-gift、dc-audio、dc-course(-group)、dc-edu-brand、dc-hotel(-search)、dc-guang、dc-notecard、dc-regis-form、dc-scan-icon(扫一扫)、dc-line、dc-content、dc-teacher

## 权限与隐私
- scope.userLocation：用于计算用户与门店距离（连锁门店场景）
- requiredPrivateInfos：getLocation、chooseLocation、chooseAddress
- 全局导航栏：白底黑字，标题留空（页面各自设置）

## 预加载规则（preloadRule 摘要）
购物车、秒杀、下单页(trade-buy/order/buy)、支付结果页、用户中心、门店地址编辑等均配置了分包预下载。

## 模板自带但未必使用的模块（PRD 中需标注"模板能力，实际启用以线上为准"）
paidcontent（付费内容）、edu（教育）、hotel（酒店）、groupbuying（社区团购）、wine-tasting（品酒会）、blind-box（盲盒）等

## 与"微信小店"的区别澄清
- 上一版 PRD 拆解的是微信小店（store.weixin.qq.com，AppID wxdf3386d65fd78506，官方交易容器）
- 本小程序为独立的有赞电商小程序，两者是不同产品
