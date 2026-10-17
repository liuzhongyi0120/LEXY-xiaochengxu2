/**
 * 官方旗舰店 5 个页面复刻素材与数据
 *
 * 素材来源：有赞官方旗舰店线上页面（首页 / 莱克 / 资讯 / 产品 / 个人中心）
 * 抓取时间：2026-10-07；图片与视频已于 2026-10-09 全部转存本站素材库。
 *
 * ⚠️ 说明
 * 1. 图片 / 视频一律走本地素材库（/uploads/...）—— 本文件不再有外部 CDN 资源。
 *    小程序端由 utils/asset.js 的 resolveAssets() 拼上 BASE_URL 后渲染，
 *    所以换服务器只需改 utils/constants.js 的 BASE_URL 一处。
 *    素材按来源归类存放（首页 / 资讯·<栏目> / <产品名> / 店铺设置 / 预览快照）。
 * 2. 不要回填有赞外链：有赞图片一旦加防盗链或改目录就大面积白图；
 *    视频（mps-trans）更带**会过期的签名** —— 实测装修数据里的签名过几天即 403，
 *    真机同样播不出。需要补图/补视频时跑 `.tooling/localize-assets.mjs`
 *    （视频签名刷新见 `.tooling/yz-fetch-videos.mjs`）。
 * 3. 商品卡片图内已含官方名称与价格，本文件不做任何二次编造；
 *    产品页型号卡片已挂站内商品详情链接（products[].link）。
 */

/* 本文件由「店铺装修后台」生成 · 最后发布 2026-10-17 12:23:12（来源：/admin） */

/** 店铺信息（首页与我的页共用） */
const SHOP = {
  name: "LEXY莱克官方旗舰店",
  avatar: "/uploads/202610/20261009-6371d5-FnmIoAG300wwWTtliJBcLGB1YJar.png",
  slogan: "莱克 · 让家更干净"
};

/** ---------------- 首页 ---------------- */
/** h 为设计稿像素高（375 宽基准），wxml 中按 rpx = px * 2 换算 */
const HOME_BLOCKS = [
  {
    type: "swiper",
    mode: "poster",
    height: 1322,
    radius: "square",
    interval: 4500,
    indicator: "dots",
    pageMargin: 0,
    imageGap: 0,
    images: [
      {
        image: "/uploads/202610/20261009-86caac-Fo69HIsVHfOzMC08PSX7N7uFY8s1.webp",
        link: "/packageGoods/detail/detail?id=g1003972"
      },
      {
        image: "/uploads/202610/20261009-44f4b4-Fl6yiLDP_qD77xcIPwrKfpbdgn3l.webp",
        link: "/packageGoods/detail/detail?id=g1003972"
      }
    ]
  },
  {
    type: "video",
    height: 420,
    src: "/uploads/202610/20261009-huuw56.mp4",
    poster: "/uploads/202610/20261009-7c88cd-FmWuKKYDvg5Wt4aDDF0BzrOtFjJ6.webp",
    autoplay: false,
    muted: true,
    controls: false,
    loop: false,
    radius: "square",
    pageMargin: 0
  },
  {
    type: "image",
    height: 1342,
    src: "/uploads/202610/20261009-e2a92a-FpEmv38JlZ6Gs7uqOc3Oc45c8ZyO.webp",
    radius: "square",
    pageMargin: 0,
    link: ""
  },
  {
    type: "line",
    style: "blank",
    height: 48,
    gapY: 0,
    color: "#EEEEEE",
    bg: "",
    pageMargin: 0
  },
  {
    type: "image",
    height: 1642,
    src: "/uploads/202610/20261009-f8b64b-Fs2JC2Rd_zFcdWuYOzLkNR_PKFP8.webp",
    radius: "square",
    pageMargin: 0,
    link: ""
  },
  {
    type: "video",
    height: 420,
    src: "/uploads/202610/20261009-f632ky.mp4",
    poster: "/uploads/202610/20261009-7a46e4-FuFIgF8CRwJ0Ea6su5y3izD9gGKe.webp",
    autoplay: false,
    muted: true,
    controls: false,
    loop: false,
    radius: "square",
    pageMargin: 0
  },
  {
    type: "image",
    height: 756,
    src: "/uploads/202610/20261009-0a2785-Fr_tsF2gAxM2M35MG16j34djUjZs.webp",
    radius: "square",
    pageMargin: 0,
    link: ""
  },
  {
    type: "image",
    height: 1326,
    src: "/uploads/202610/20261009-a25845-FhZ_bsHU5p4qvtJlg5a7rprmsHhB.webp",
    radius: "square",
    pageMargin: 0,
    link: ""
  },
  {
    type: "video",
    height: 420,
    src: "/uploads/202610/20261009-pj6lis.mp4",
    poster: "/uploads/202610/20261009-6a796a-XvLEB33Z0lZ-QiYQ2eRMzI899fRo2arKyE_6qg_c.jpg",
    autoplay: false,
    muted: true,
    controls: false,
    loop: false,
    radius: "square",
    pageMargin: 0
  },
  {
    type: "image",
    height: 652,
    src: "/uploads/202610/20261009-fe18b3-FhkZ06W7Z8D16Cd0ULEu700z0_kr.webp",
    radius: "square",
    pageMargin: 0,
    link: ""
  },
  {
    type: "image",
    height: 882,
    src: "/uploads/202610/20261009-b8a41a-Fs-nj3UEvr_44TFpny7zs8_0TZB2.webp",
    radius: "square",
    pageMargin: 0,
    link: ""
  },
  {
    type: "video",
    height: 420,
    src: "/uploads/202610/20261009-wvq94t.mp4",
    poster: "/uploads/202610/20261009-db6432-J2S8RqWN_Lla-3X3b99IvkTEmX4tvEsMaSCWog_c.jpg",
    autoplay: false,
    muted: true,
    controls: false,
    loop: false,
    radius: "square",
    pageMargin: 0
  },
  {
    type: "image",
    height: 598,
    src: "/uploads/首页/FtvYjCwh63g2WYeVU7Pm9nY5wmpc.png",
    radius: "square",
    pageMargin: 0,
    link: ""
  },
  {
    type: "swiper",
    mode: "single",
    height: 2052,
    radius: "square",
    interval: 4500,
    indicator: "dots",
    pageMargin: 0,
    imageGap: 0,
    images: [
      {
        image: "/uploads/首页/FqUkbtDssN5a_bkdNKxqI6XM12dL.png",
        link: ""
      },
      {
        image: "/uploads/首页/Fr1uBwoTH6nnNiPQgRhte1Pa84N0.png",
        link: ""
      },
      {
        image: "/uploads/首页/FgEGHs0O89DzGGM7yML3Lmg318PO.png",
        link: ""
      }
    ]
  }
];

/** ---------------- 我的（个人中心） ---------------- */
/** 区块类型比首页多 5 种个人中心专属区块 + 4 种个人中心独有组件（见 server/decorate/yzUserCenter.js） */
const MINE_BLOCKS = [
  {
    type: "uc_navbar",
    title: "个人中心",
    desc: "",
    bgMode: "default",
    bgColor: "#FFFFFF",
    bgImage: "",
    mode: "immersive"
  },
  {
    type: "uc_profile",
    bgImage: "",
    gradient: "none",
    align: "center",
    nameColor: "#333333",
    codeColor: "#FFFFFF",
    showLevel: "show",
    barStyle: "s1"
  },
  {
    type: "uc_stats",
    showBalance: true,
    showPoints: true,
    showCard: false,
    showCoupon: true,
    showWallet: false,
    showGiftCard: false,
    showPickupCard: false
  },
  {
    type: "uc_order",
    title: "我的订单",
    showAll: true,
    showPendingPay: true,
    showPendingShip: true,
    showShipped: true,
    showReview: true,
    showRefund: true
  },
  {
    type: "uc_tools",
    mode: "grid",
    iconMode: "fill",
    plugins: [
      {
        type: "memberCode",
        title: "会员码",
        show: false,
        scope: "all",
        icon: "vip-card",
        real: true,
        enabled: true
      },
      {
        type: "taskCenter",
        title: "任务中心",
        show: true,
        scope: "all",
        icon: "notes",
        real: false,
        enabled: true
      },
      {
        type: "cart",
        title: "购物车",
        show: true,
        scope: "all",
        icon: "cart",
        real: true,
        enabled: true
      },
      {
        type: "gifts",
        title: "赠品",
        show: true,
        scope: "all",
        icon: "point-gift",
        real: false,
        enabled: true
      },
      {
        type: "customerServiceChat",
        title: "客服聊天",
        show: true,
        scope: "all",
        icon: "chat",
        real: true,
        enabled: true
      },
      {
        type: "deliveryAddress",
        title: "收货地址",
        show: true,
        scope: "all",
        icon: "location",
        real: true,
        enabled: true
      },
      {
        type: "merchantsCall",
        title: "拨打商家电话",
        show: false,
        scope: "all",
        icon: "phone-circle",
        real: true,
        enabled: true
      },
      {
        type: "cashBack",
        title: "返现",
        show: false,
        scope: "all",
        icon: "cash-back-record",
        real: false,
        enabled: true
      },
      {
        type: "fxCenter",
        title: "分销员中心",
        show: true,
        scope: "fx",
        icon: "smile-comment",
        real: false,
        enabled: true
      },
      {
        type: "offlineStore",
        title: "线下门店",
        show: true,
        scope: "all",
        icon: "shop",
        real: false,
        enabled: true
      },
      {
        type: "purchaseColumnAndContent",
        title: "课程",
        show: false,
        scope: "all",
        icon: "newspaper",
        real: false,
        enabled: true
      },
      {
        type: "paidContentCertificate",
        title: "证书",
        show: false,
        scope: "all",
        icon: "description",
        real: false,
        enabled: true
      },
      {
        type: "paidContentExamination",
        title: "考试",
        show: false,
        scope: "all",
        icon: "completed",
        real: false,
        enabled: true
      },
      {
        type: "exchangeGiftCard",
        title: "兑换礼品卡",
        show: false,
        scope: "all",
        icon: "gift-card",
        real: false,
        enabled: true
      },
      {
        type: "paidContentExerciseBook",
        title: "作业本",
        show: false,
        scope: "all",
        icon: "records",
        real: false,
        enabled: true
      },
      {
        type: "blankLine",
        title: "留白",
        show: false,
        scope: "all",
        icon: "todo-list",
        real: false,
        enabled: true
      },
      {
        type: "exhibitionReserve",
        title: "活动预订",
        show: false,
        scope: "all",
        icon: "notes",
        real: false,
        enabled: true
      },
      {
        type: "accountSettings",
        title: "账号与安全",
        show: true,
        scope: "all",
        icon: "setting",
        real: true,
        enabled: true
      },
      {
        type: "restaurantReserve",
        title: "预约订座",
        show: false,
        scope: "all",
        icon: "restaurant-booking",
        real: false,
        enabled: true
      },
      {
        type: "referralRewards",
        title: "邀请有礼",
        show: false,
        scope: "all",
        icon: "gift-card",
        real: false,
        enabled: false
      },
      {
        type: "about",
        title: "关于我们",
        show: true,
        scope: "all",
        icon: "description",
        real: true,
        enabled: true
      },
      {
        type: "favorite",
        title: "我的收藏",
        show: true,
        scope: "all",
        icon: "bookmark",
        real: true,
        enabled: true
      },
      {
        type: "footprint",
        title: "浏览记录",
        show: true,
        scope: "all",
        icon: "records",
        real: true,
        enabled: true
      }
    ]
  }
];

/** ---------------- 莱克（产品系列） ---------------- */
const LEXY_SERIES = [
  {
    id: "tianlangxing",
    name: "天狼星系列",
    title: "三合一 大吸力",
    subtitle: "洗地机丨除螨机丨吸尘器",
    hero: "/uploads/202610/20261009-f4ef10-FhL5SFjTD4twqazFt_Aj6S-f8ROe.webp",
    products: [
      {
        id: "t1",
        image: "/uploads/202610/20261009-b8e181-FhbUPVZ2L4pTbP9KiD9YuCBKFKHz.webp"
      },
      {
        id: "t2",
        image: "/uploads/202610/20261009-e6829d-FvbNbJK_Azo9evrthrh-DxXzPgBc.webp"
      },
      {
        id: "t3",
        image: "/uploads/202610/20261009-8b4d8d-FgQ5Vn2d6FVBnzloRyq2_3TTxhbA.webp"
      }
    ]
  },
  {
    id: "tianwangxing",
    name: "天王星系列",
    title: "三合一 大吸力",
    subtitle: "吸尘器 | 擦地机 | 除螨机",
    hero: "/uploads/202610/20261009-800a8f-Fn0VTWldpDlzZ6yjf_7tU9GYPiAR.webp",
    products: [
      {
        id: "w1",
        image: "/uploads/202610/20261009-74418e-Fs0mn4BTQOywMmFO2KPJKI5CeEc0.webp"
      },
      {
        id: "w2",
        image: "/uploads/202610/20261009-2657dc-Fkap9MaaJZE6Y1MzDmRMOhLoRf7Q.webp"
      },
      {
        id: "w3",
        image: "/uploads/202610/20261009-33fcaa-Fqhat9-D5nWUbl8jXDFingSWaGUp.webp"
      }
    ]
  },
  {
    id: "haiwangxing",
    name: "海王星系列",
    title: "三合一 大吸力",
    subtitle: "洗地机丨除螨机丨吸尘器",
    hero: "/uploads/202610/20261009-a5e8f6-FjcLbGZAvlDqt5gFi-4XQ3_ksID8.webp",
    products: [
      {
        id: "h1",
        image: "/uploads/202610/20261009-7f1c63-Fm0qE7-iDMjl1fg69mpeUkcIAfM5.webp"
      },
      {
        id: "h2",
        image: "/uploads/202610/20261009-b36220-FksvwngdwWGcuO9Y_CSWEQk1zjFc.webp"
      },
      {
        id: "h3",
        image: "/uploads/202610/20261009-8c8f4b-Fi3IHs-mJ5hrC-fmZvXAUOW1sJ54.webp"
      },
      {
        id: "h4",
        image: "/uploads/202610/20261009-bd789d-FjoB3ke-gqcD7Q4Y1OZS_F0W26Vf.webp"
      }
    ]
  },
  {
    id: "kongjing",
    name: "空净系列",
    title: "大洁净空气量甲醛净化器",
    subtitle: "快速除醛丨入住无忧",
    hero: "/uploads/202610/20261009-e0382d-Ft2Fh97u6ZrsczSIpPs5hJeofEqs.webp",
    products: [
      {
        id: "k1",
        image: "/uploads/202610/20261009-3374ec-FoU-EV_UaGilDLUNy0rR-Vk0JHUb.webp"
      },
      {
        id: "k2",
        image: "/uploads/202610/20261009-dc7ec1-Fns3sJQW1ljyqUmp_9p_eHoVUlWW.webp"
      },
      {
        id: "k3",
        image: "/uploads/202610/20261009-45acea-Fo7Q_IGaDywnh59ooGySHDk5bTtm.webp"
      },
      {
        id: "k4",
        image: "/uploads/202610/20261009-af0a25-FrqIKTJUTNE4HarMiH0sIR00p87e.webp"
      }
    ]
  },
  {
    id: "xunhuaneshan",
    name: "循环扇系列",
    title: "智能空气调节扇",
    subtitle: "全屋循环丨静音轻享",
    hero: "/uploads/202610/20261009-f0b1c1-FqOj2XsFy3dpqEfidl0Tb1pJTNSl.webp",
    products: [
      {
        id: "f1",
        image: "/uploads/202610/20261009-da3b0b-FkUE7J2fqJAd6bWCwQxlF01ff9Zs.webp"
      },
      {
        id: "f2",
        image: "/uploads/202610/20261009-852b77-FtCowr9egFSfsvZ6KXlDzdUTl03e.webp"
      },
      {
        id: "f3",
        image: "/uploads/202610/20261009-ea89b3-FsoaIBmVgmXb33z_FMM9Mvc8O6o0.webp"
      }
    ]
  },
  {
    id: "mojie",
    name: "魔洁系列",
    title: "魔洁丨立式无线吸尘器",
    subtitle: "立式设计 更轻便",
    hero: "/uploads/202610/20261009-4fe63e-FmEqqe9Me172CI3n75WfUzos8PBT.webp",
    products: [
      {
        id: "m1",
        image: "/uploads/202610/20261009-613930-FvdBdDcQcOdP6eoebRbyUb43qaq2.webp"
      },
      {
        id: "m2",
        image: "/uploads/202610/20261009-bf6def-FjzExe9mJ2XDeBqmaoKxAS_Oz2__.webp"
      },
      {
        id: "m3",
        image: "/uploads/202610/20261009-c3b9cb-Fi5mS2KVfiY7J22pQ3WwQyx3PcpI.webp"
      },
      {
        id: "m4",
        image: "/uploads/202610/20261009-e0091d-FtEU8EwjEfT9_0298l1PMftagrnc.webp"
      }
    ]
  },
  {
    id: "chuifengji",
    name: "吹风机系列",
    title: "水离子涡扇吹风机",
    subtitle: "纳米水离子丨吹发更丝滑",
    hero: "/uploads/202610/20261009-5f40b4-FozxJM1YpB7WS1C3l9-aVTUVeezl.webp",
    products: [
      {
        id: "c1",
        image: "/uploads/202610/20261009-c97a7c-FmRo_QgyDOPnMjSDkfOEJI_XWfnY.webp"
      },
      {
        id: "c2",
        image: "/uploads/202610/20261009-0b9f52-FhPlih9_l-80MAHsZP7AIYz17Run.webp"
      }
    ]
  }
];

/** ---------------- 资讯（了解莱克，8 个栏目 → 内容页） ---------------- */
const NEWS = {
  en: "UNDERSTAND LEXY",
  title: "了解莱克",
  big: [
    {
      id: "n1",
      key: "about",
      label: "关于莱克",
      image: "/uploads/202610/20261009-qb98q8.webp"
    },
    {
      id: "n2",
      key: "news",
      label: "新闻大事",
      image: "/uploads/202610/20261009-seqsln.webp"
    }
  ],
  small: [
    {
      id: "n3",
      key: "history",
      label: "创业故事",
      image: "/uploads/202610/20261009-phx5e8.webp"
    },
    {
      id: "n4",
      key: "brands",
      label: "我们品牌",
      image: "/uploads/202610/20261009-ug6eh9.webp"
    },
    {
      id: "n5",
      key: "share",
      label: "用户分享",
      image: "/uploads/202610/20261009-7onove.webp"
    },
    {
      id: "n6",
      key: "business",
      label: "业务模式",
      image: "/uploads/202610/20261009-7sjf19.webp"
    },
    {
      id: "n7",
      key: "service",
      label: "售后服务",
      image: "/uploads/202610/20261009-2dxvhw.webp"
    },
    {
      id: "n8",
      key: "join",
      label: "加入我们",
      image: "/uploads/202610/20261009-lti3hu.webp"
    }
  ]
};

/** ---------------- 产品（左栏品牌导航 + 右侧分组与型号） ---------------- */
const PRODUCT_NAV_LOGO = "/uploads/202610/20261009-cf57b6-FqJzOV45r-RW6l48xjsmk95oHEnX.png";

const PRODUCT_BRANDS = [
  {
    id: "lexy",
    name: "莱克",
    groups: [
      {
        header: "/uploads/202610/20261009-48e0f5-Fo67RLzF9eQ6DB_5C38ufUycXSJV.webp",
        link: "/pages/custom/index?key=p149",
        yzId: "",
        products: [
          {
            id: "lexy-1-1",
            model: "S10系列",
            image: "/uploads/202610/20261009-9888f2-Fkd0LlSB743H6c-NfBMQho7ARVd0.webp",
            link: "/packageGoods/detail/detail?id=g1003972",
            yzId: "35y0chueb2pnaxa"
          },
          {
            id: "lexy-1-2",
            model: "S9 Max",
            image: "/uploads/202610/20261009-02d7a8-FpnR4wiWr7c6rwCtbKQOcJ3iKFlp.webp",
            link: "/packageGoods/detail/detail?id=g_1791524125208_wq8k",
            yzId: "2oe54t9wriqjqah"
          },
          {
            id: "lexy-1-3",
            model: "S8",
            image: "/uploads/202610/20261009-458ebf-Flq7-V_UQ9S6PJtXtihYZfQ789v0.webp",
            link: "/packageGoods/detail/detail?id=g_1791524127132_x80v",
            yzId: "3npcxabk2u3zaxj"
          },
          {
            id: "lexy-1-4",
            model: "H5",
            image: "/uploads/202610/20261009-aaa690-FjfKOnDS9ccssxtsBluom43LsUXp.webp",
            link: "/packageGoods/detail/detail?id=g_1791524128415_kzuh",
            yzId: "1y7tschyv4mcmzv"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-80a840-Fsq4JsfZWotl-EYRQ89GJMrTWuPQ.webp",
        link: "",
        yzId: "1yaatujlfrwomum",
        products: [
          {
            id: "lexy-2-1",
            model: "U7",
            image: "/uploads/202610/20261009-61550e-FmwdANScv22qOUTxw7Q3jGA1EnaU.webp",
            link: "/packageGoods/detail/detail?id=g_1791524129404_76qp",
            yzId: "1yaatujlfrwomum"
          },
          {
            id: "lexy-2-2",
            model: "U5",
            image: "/uploads/202610/20261009-61550e-FmwdANScv22qOUTxw7Q3jGA1EnaU.webp",
            link: "/packageGoods/detail/detail?id=g_1791524129404_76qp",
            yzId: "1yaatujlfrwomum"
          },
          {
            id: "lexy-2-3",
            model: "U3",
            image: "/uploads/202610/20261009-61550e-FmwdANScv22qOUTxw7Q3jGA1EnaU.webp",
            link: "/packageGoods/detail/detail?id=g_1791524129404_76qp",
            yzId: "1yaatujlfrwomum"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-63b53e-FkdbEMRUfzOa3TE3YZs3K0_em8tQ.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-3-1",
            model: "F701",
            image: "/uploads/202610/20261009-643fed-FojMRjEyLfK2bvq_Xs0SB2NdIyxo.webp",
            link: "/packageGoods/detail/detail?id=g_1791524130973_p3ef",
            yzId: "3epcncg0n3b0m13"
          },
          {
            id: "lexy-3-2",
            model: "F503",
            image: "/uploads/202610/20261009-002912-FpBGxe1IUNELPWyViS4rqmdV9iUE.webp",
            link: "/packageGoods/detail/detail?id=g_1791524132427_2qfp",
            yzId: "2fxvf26rje8hi1f"
          },
          {
            id: "lexy-3-3",
            model: "F402",
            image: "/uploads/202610/20261009-410957-FmqUYSralGqTctMVG0wH7X6O3c2j.webp",
            link: "/packageGoods/detail/detail?id=g_1791524133315_td5e",
            yzId: "2xgl1uupfs9aeqy"
          },
          {
            id: "lexy-3-4",
            model: "F305",
            image: "/uploads/202610/20261009-3181c8-FvJdPFKBFGs9g4z90unm1IdyFsh2.webp",
            link: "/packageGoods/detail/detail?id=g_1791524134837_8p5n",
            yzId: "3eo4b4f5qiw5yl0"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-2a9b1e-Fv5PeGTPHuihWGklnREISuDqM2E7.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-4-1",
            model: "DH650",
            image: "/uploads/202610/20261009-f3bad2-FnnBw93sMhFR4aDDxYI_-juXhqTL.webp",
            link: "/packageGoods/detail/detail?id=g_1791524135926_wlaa",
            yzId: "1y7ub3q71cnzq"
          },
          {
            id: "lexy-4-2",
            model: "DH350",
            image: "/uploads/202610/20261009-c20226-Fg2vaP3wOk-0TSj3HN-4OPZ99ubk.webp",
            link: "/packageGoods/detail/detail?id=g_1791524137197_hkrw",
            yzId: "2xlilvs4t5n4m"
          },
          {
            id: "lexy-4-3",
            model: "DH200",
            image: "/uploads/202610/20261009-b962e3-Fmjt9H5C1Mpl40uBiTZ2jL5N6wVh.webp",
            link: "/packageGoods/detail/detail?id=g_1791524138043_aoax",
            yzId: "3nj7didd0fsee"
          },
          {
            id: "lexy-4-4",
            model: "DH180",
            image: "/uploads/202610/20261009-5dafb6-FtkqbdSYdPcurK28-u_lejPooyIz.webp",
            link: "/packageGoods/detail/detail?id=g_1791524139121_ncpv",
            yzId: "3f0f873ufjq3q"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-3c108e-FgixT8XIbomzZDt0p6DpT3V0fb86.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-5-1",
            model: "K9Pro",
            image: "/uploads/202610/20261009-4c30ea-FnlRhVhmau19DCuj4GmJaobKU_cE.webp",
            link: "/packageGoods/detail/detail?id=g_1791524140352_i4vk",
            yzId: "2fp90b5eqvybqla"
          },
          {
            id: "lexy-5-2",
            model: "K8Pro",
            image: "/uploads/202610/20261009-344c03-Fm-cxiBjfRZX1KsmAd9KIjQAOVos.webp",
            link: "/packageGoods/detail/detail?id=g_1791524141704_f4t7",
            yzId: "2xj1eajjazpeezo"
          },
          {
            id: "lexy-5-3",
            model: "K6Pro",
            image: "/uploads/202610/20261009-548112-Fukc0GQ_e7u7hMRItEPMv0R1IzI5.webp",
            link: "/packageGoods/detail/detail?id=g_1791524142815_7yl4",
            yzId: "1y6lsfdfxgfzqci"
          },
          {
            id: "lexy-5-4",
            model: "K5Pro",
            image: "/uploads/202610/20261009-6014c4-Fljryg1yz5a5CCWaUo9i2k7np-bi.webp",
            link: "/packageGoods/detail/detail?id=g_1791524144256_yrms",
            yzId: "3nrswwqbhdmrqik"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-9f5a53-FnmjJ8mITBYrylcNulhhPZ8JCfVT.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-6-1",
            model: "F8",
            image: "/uploads/202610/20261009-abcd89-FjdlbJMsJF-zgEk2f0zy7sOgjJHK.webp",
            link: "/packageGoods/detail/detail?id=g_1791524145595_a9bk",
            yzId: "2x96thdtxt1c6"
          },
          {
            id: "lexy-6-2",
            model: "F6",
            image: "/uploads/202610/20261009-841bb0-FgVnlHGKtX0Y9gesfAAaeUhemmg8.webp",
            link: "/packageGoods/detail/detail?id=g_1791524146881_26zx",
            yzId: "36ctiksl11k7a40"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-761ae7-Ftf8D1LuLcdKVXN-bBTLoROOONBE.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-7-1",
            model: "M9",
            image: "/uploads/202610/20261009-a1a7b1-FtkTuoukoSuOUR80HRKnAgnGFe21.webp",
            link: "/packageGoods/detail/detail?id=g_1791524148642_qnms",
            yzId: "3nvhrwex6ltaegb"
          },
          {
            id: "lexy-7-2",
            model: "M7",
            image: "/uploads/202610/20261009-cc0e77-Fl1eE8P3zPUmYL0YxRUBp2uCEFWc.webp",
            link: "/packageGoods/detail/detail?id=g_1791524150427_1dge",
            yzId: "276ki4fm3ko2un5"
          },
          {
            id: "lexy-7-3",
            model: "C80",
            image: "/uploads/202610/20261009-377b6f-Flw2f4bTOm_9aOLFZtwmpirhGBLs.webp",
            link: "/packageGoods/detail/detail?id=g_1791524151699_5edx",
            yzId: "2flkhpukjiyae76"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-c1be63-FvvRyN8bAKywboD0dfbYyCDfAgUr.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-8-1",
            model: "N7 Pro",
            image: "/uploads/202610/20261009-484f9a-FnOdMW3Ess2C2URoMXJ-JwVuMkhe.webp",
            link: "/packageGoods/detail/detail?id=g_1791524153433_n1ds",
            yzId: "2fmtd0hkillditm"
          },
          {
            id: "lexy-8-2",
            model: "N7",
            image: "/uploads/202610/20261009-484f9a-FnOdMW3Ess2C2URoMXJ-JwVuMkhe.webp",
            link: "/packageGoods/detail/detail?id=g_1791524155048_ogys",
            yzId: "2g0cmc0u5p7vac9"
          },
          {
            id: "lexy-8-3",
            model: "N5 Pro",
            image: "/uploads/202610/20261009-484f9a-FnOdMW3Ess2C2URoMXJ-JwVuMkhe.webp",
            link: "/packageGoods/detail/detail?id=g_1791524155625_dtkq",
            yzId: "3nlmuhxzp61c647"
          },
          {
            id: "lexy-8-4",
            model: "N5",
            image: "/uploads/202610/20261009-484f9a-FnOdMW3Ess2C2URoMXJ-JwVuMkhe.webp",
            link: "/packageGoods/detail/detail?id=g_1791524156197_qowf",
            yzId: "2oo0r7i1gm77a4l"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-d87f2b-FpKxayRUWqVFY11kBrmkjsX3rT1f.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-9-1",
            model: "HU801",
            image: "/uploads/202610/20261009-abf413-Fh-AqUmxQO31VRmDNjqnslzkcKz9.webp",
            link: "/packageGoods/detail/detail?id=g_1791524159269_1bb0",
            yzId: "3647gdeeixxcmlc"
          },
          {
            id: "lexy-9-2",
            model: "HU701",
            image: "/uploads/202610/20261009-505848-Fh898PuKTYwwOEmE6m_Qan2d0__p.webp",
            link: "/packageGoods/detail/detail?id=g_1791524160227_a92h",
            yzId: "2xlhe5qd0w12u"
          },
          {
            id: "lexy-9-3",
            model: "HU301",
            image: "/uploads/202610/20261009-e9b5a5-Fva-SHmiuHq0BXrOBDX0eyn8RH3R.webp",
            link: "/packageGoods/detail/detail?id=g_1791524161202_op43",
            yzId: "36acb4s5z2v5i"
          }
        ]
      }
    ]
  },
  {
    id: "biquan",
    name: "碧云泉",
    groups: [
      {
        header: "/uploads/202610/20261009-612440-FvEIXaPftKtlBwEL5aV8kopRbBvY.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "biquan-1-1",
            model: "RT801",
            image: "/uploads/202610/20261009-c0da9b-FiwvJA9VYKmwpeVPUcuUHiWmsGH_.webp",
            link: "/packageGoods/detail/detail?id=g_1791524603243_sdtu",
            yzId: "27bi1z8sivotywt"
          },
          {
            id: "biquan-1-2",
            model: "RT702",
            image: "/uploads/202610/20261009-1725a9-FlJeBswRNWd2j7EAGQyZqlZqYle7.webp",
            link: "/packageGoods/detail/detail?id=g_1791524604590_5gfg",
            yzId: "26xyfxxmbm79iog"
          },
          {
            id: "biquan-1-3",
            model: "T5 系列",
            image: "/uploads/202610/20261009-a74b57-FpBoSUJzf7Hwx63f5fsw7LLP7rhQ.webp",
            link: "/packageGoods/detail/detail?id=g_1791524605600_4j67",
            yzId: "3eo67kl483wzabp"
          },
          {
            id: "biquan-1-4",
            model: "T5Max",
            image: "/uploads/202610/20261009-45c94b-FghNaldM1oL1pkUn01jPcPbn85Fh.webp",
            link: "/packageGoods/detail/detail?id=g_1791524606775_fenp",
            yzId: "2orpm779cb2li7t"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-e85aaa-Fk4oNbQTdIYGwWCmO6p7SuDgJ1wP.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "biquan-2-1",
            model: "R803",
            image: "/uploads/202610/20261009-d6c4a3-Fp9zYV7cHr9YOh5DzOcO0NsK1oZA.webp",
            link: "/packageGoods/detail/detail?id=g_1791524608116_wqip",
            yzId: "3ne8fptryrxs6ct"
          },
          {
            id: "biquan-2-2",
            model: "G5",
            image: "/uploads/202610/20261009-ab7d35-FmWIa6Ce1PAXEhtEsmKVJllpBapQ.webp",
            link: "/packageGoods/detail/detail?id=g_1791524609541_iy4o",
            yzId: "2oqf0o1bwyfxi4e"
          },
          {
            id: "biquan-2-3",
            model: "R702",
            image: "/uploads/202610/20261009-f4a9d2-FjWf-30PhfYy-7ELe3Z9pnYrgv1I.webp",
            link: "/packageGoods/detail/detail?id=g_1791524610978_cgbx",
            yzId: "3epd604zka6ue"
          },
          {
            id: "biquan-2-4",
            model: "C5Pro",
            image: "/uploads/202610/20261009-6516b2-Fr2BbQUJEi-0l_C6-TwDZR78vmCy.webp",
            link: "/packageGoods/detail/detail?id=g_1791524613616_h0om",
            yzId: "3ervf5nngwc4mhh"
          },
          {
            id: "biquan-2-5",
            model: "C5Plus",
            image: "/uploads/202610/20261009-de2099-Fk4qV94T1OvQmyBNtnB7t5pO0yXc.webp",
            link: "/packageGoods/detail/detail?id=g_1791524615445_sfdd",
            yzId: "2oqhg6tay37bacx"
          },
          {
            id: "biquan-2-6",
            model: "V6",
            image: "/uploads/202610/20261009-2a432c-FmeQKzMYsEMqIshiWBj2a9dZ9IGn.webp",
            link: "/packageGoods/detail/detail?id=g_1791524617189_d46y",
            yzId: "2xfbui4wmrw46zs"
          }
        ]
      },
      {
        header: "/uploads/202610/20261009-83c272-FklpN_ccPF92CAPQpz77X-M2wM8_.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "biquan-3-1",
            model: "JSC-RL801",
            image: "/uploads/202610/20261009-174c92-FloS49Lts6XXDfq1Z52JyGBIuQw2.webp",
            link: "/packageGoods/detail/detail?id=g_1791524619964_isv4",
            yzId: "36csneaizinba9x"
          },
          {
            id: "biquan-3-2",
            model: "JSC-UL301",
            image: "/uploads/202610/20261009-c8bad5-FmDm01gQoG9HiR2Fzn6-DXUprtNW.webp",
            link: "/packageGoods/detail/detail?id=g_1791524621509_zpqe",
            yzId: "35z8p4t1tdsdisu"
          }
        ]
      }
    ]
  },
  {
    id: "jimi",
    name: "吉米",
    groups: [
      {
        header: "/uploads/202610/20261009-7f7560-Fu1hIeOrlmLLNFEopLoee6dW8DBz.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "jimi-1-1",
            model: "M7Ultra",
            image: "/uploads/202610/20261009-e45852-FkRcNDJuKJIxOSXPsyCd24Rbbe2m.webp",
            link: "/packageGoods/detail/detail?id=g_1791524623060_z6sb",
            yzId: "275bt36ex22eefz"
          },
          {
            id: "jimi-1-2",
            model: "M7 Pro",
            image: "/uploads/202610/20261009-752a17-FklZ_76ViIQOyRqecTvbrWMyRhFE.webp",
            link: "/packageGoods/detail/detail?id=g_1791524624571_zeay",
            yzId: "26u75fftdaswmz0"
          },
          {
            id: "jimi-1-3",
            model: "B6 Pro",
            image: "/uploads/202610/20261009-1153fe-FqdkUaI0hmZ6m-UhJFeT3CtV3yUq.webp",
            link: "/packageGoods/detail/detail?id=g_1791524625909_jbbs",
            yzId: "1y5dshb9ha2tyjc"
          },
          {
            id: "jimi-1-4",
            model: "M5",
            image: "/uploads/202610/20261009-d709e4-Fi60unEUKxU9vReKZ7Q4mdxMHaid.webp",
            link: "/packageGoods/detail/detail?id=g_1791524626874_vd4p",
            yzId: "2ou6b2yrk4qyeu7"
          }
        ]
      }
    ]
  },
  {
    id: "kaboshi",
    name: "咖博士",
    groups: [
      {
        header: "/uploads/202610/20261009-b6e49b-FgrlV9S_ju_GIYwKzYPzQIPIrFO3.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "kaboshi-1-1",
            model: "Grace 200",
            image: "/uploads/202610/20261009-ab8ea7-FmyWJnn9YEgPQi4tQ5r1BT6Jrl7S.webp",
            link: "/packageGoods/detail/detail?id=g_1791524628569_nvh7",
            yzId: "2xk7o01k7ai2unp"
          },
          {
            id: "kaboshi-1-2",
            model: "H1S",
            image: "/uploads/202610/20261009-a3cd37-FoJQki6IQ5g6qvip3qPtvfSKaF-y.webp",
            link: "/packageGoods/detail/detail?id=g_1791524629713_aa7s",
            yzId: "2x7xfmk0rsh9ixi"
          },
          {
            id: "kaboshi-1-3",
            model: "HOT 300",
            image: "/uploads/202610/20261009-d46211-Fj46kBroh4ddNy83IetSSjcD-ToD.webp",
            link: "/packageGoods/detail/detail?id=g_1791524631618_c674",
            yzId: "2x49ftbv6d5zqni"
          },
          {
            id: "kaboshi-1-4",
            model: "HOT 100",
            image: "/uploads/202610/20261009-d116d6-FpFW0m03x6w69n_tek9KMqNCqVSj.webp",
            link: "/packageGoods/detail/detail?id=g_1791524632667_du0l",
            yzId: "2fvf2qvnoqujqdj"
          }
        ]
      }
    ]
  }
];

/** ---------------- 自定义页面（key → { name, blocks }，由装修台「新建页面」创建） ---------------- */
const CUSTOM_PAGES = {
  p149: {
    name: "测试",
    blocks: [
      {
        type: "swiper",
        mode: "poster",
        height: 1322,
        radius: "square",
        images: [
          {
            image: "/uploads/202610/20261009-7k2u7a.webp",
            link: ""
          }
        ],
        id: "xmv0pumyatyd"
      }
    ],
    meta: {
      desc: "",
      bg: "#F5F6F8",
      style: "standard"
    }
  },
  p159: {
    name: "1",
    blocks: [],
    meta: {
      desc: "",
      bg: "#F5F6F8",
      style: "standard"
    }
  },
  p236: {
    name: "全系",
    blocks: [
      {
        id: "bcatmv235a76",
        type: "brand_category",
        brands: [
          {
            title: "莱克",
            panels: [
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-w2n50v.jpg",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-3h98p4.png",
                    title: "S10系列",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g1003972"
                  },
                  {
                    image: "/uploads/202610/20261010-jsgepc.png",
                    title: "S9 Max",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524125208_wq8k"
                  },
                  {
                    image: "/uploads/202610/20261010-zmdyzh.png",
                    title: "S8",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524127132_x80v"
                  },
                  {
                    image: "/uploads/202610/20261010-530r6z.png",
                    title: "H5",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524128415_kzuh"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-shnp8z.jpg",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-4onc2w.png",
                    title: "U7",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  },
                  {
                    image: "/uploads/202610/20261010-4onc2w.png",
                    title: "U5",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  },
                  {
                    image: "/uploads/202610/20261010-4onc2w.png",
                    title: "U3",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-wmoqh5.png",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-vmk5wc.jpg",
                    title: "F701",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524130973_p3ef"
                  },
                  {
                    image: "/uploads/202610/20261010-dok1v7.jpg",
                    title: "F503",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524132427_2qfp"
                  },
                  {
                    image: "/uploads/202610/20261010-lizj1f.png",
                    title: "F402",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524133315_td5e"
                  },
                  {
                    image: "/uploads/202610/20261010-to74nd.jpg",
                    title: "F305",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524134837_8p5n"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-8t9716.png",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-zam1ia.png",
                    title: "DH650",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524135926_wlaa"
                  },
                  {
                    image: "/uploads/202610/20261010-7jl369.png",
                    title: "DH350",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524137197_hkrw"
                  },
                  {
                    image: "/uploads/202610/20261010-ih55bg.png",
                    title: "DH200",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524138043_aoax"
                  },
                  {
                    image: "/uploads/202610/20261010-hc5231.png",
                    title: "DH180",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524139121_ncpv"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-a1e1lq.png",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-9z0qop.png",
                    title: "K9Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524140352_i4vk"
                  },
                  {
                    image: "/uploads/202610/20261010-vmaa8n.png",
                    title: "K8Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524141704_f4t7"
                  },
                  {
                    image: "/uploads/202610/20261010-c9ys81.png",
                    title: "K6Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524142815_7yl4"
                  },
                  {
                    image: "/uploads/202610/20261010-seamte.png",
                    title: "K5Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524144256_yrms"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-8vaz9h.png",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-1je762.jpg",
                    title: "F8",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524145595_a9bk"
                  },
                  {
                    image: "/uploads/202610/20261010-s76aia.jpg",
                    title: "F6",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524146881_26zx"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-e71oxw.jpg",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-oo12ns.jpg",
                    title: "M9",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524148642_qnms"
                  },
                  {
                    image: "/uploads/202610/20261010-q4nm2m.png",
                    title: "M7",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524150427_1dge"
                  },
                  {
                    image: "/uploads/202610/20261010-pgozvw.png",
                    title: "C80",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524151699_5edx"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-aoaolc.jpg",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-vyr5b9.jpg",
                    title: "N7 Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524153433_n1ds"
                  },
                  {
                    image: "/uploads/202610/20261010-vyr5b9.jpg",
                    title: "N7",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524155048_ogys"
                  },
                  {
                    image: "/uploads/202610/20261010-vyr5b9.jpg",
                    title: "N5 Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524155625_dtkq"
                  },
                  {
                    image: "/uploads/202610/20261010-vyr5b9.jpg",
                    title: "N5",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524156197_qowf"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-dir49a.png",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-shyjj5.png",
                    title: "HU801",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524159269_1bb0"
                  },
                  {
                    image: "/uploads/202610/20261010-ho89rh.png",
                    title: "HU701",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524160227_a92h"
                  },
                  {
                    image: "/uploads/202610/20261010-k1lzn6.png",
                    title: "HU301",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524161202_op43"
                  }
                ]
              }
            ]
          },
          {
            title: "碧云泉",
            panels: [
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-glo64x.jpg",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-phapi0.png",
                    title: "RT801",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524603243_sdtu"
                  },
                  {
                    image: "/uploads/202610/20261010-6eddbr.jpg",
                    title: "RT702",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524604590_5gfg"
                  },
                  {
                    image: "/uploads/202610/20261010-t3d20z.jpg",
                    title: "T5 系列",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524605600_4j67"
                  },
                  {
                    image: "/uploads/202610/20261010-4jmax4.png",
                    title: "T5Max",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524606775_fenp"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-i00qil.jpg",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-0ut2yn.png",
                    title: "R803",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524608116_wqip"
                  },
                  {
                    image: "/uploads/202610/20261010-w63jav.png",
                    title: "G5",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524609541_iy4o"
                  },
                  {
                    image: "/uploads/202610/20261010-be5zox.jpg",
                    title: "R702",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  },
                  {
                    image: "/uploads/202610/20261010-acxaif.png",
                    title: "C5Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524613616_h0om"
                  },
                  {
                    image: "/uploads/202610/20261010-yftf26.png",
                    title: "C5Plus",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524615445_sfdd"
                  },
                  {
                    image: "/uploads/202610/20261010-fipgfy.png",
                    title: "V6",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524617189_d46y"
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-c5cugg.png",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-ararf0.png",
                    title: "JSC-RL801",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524619964_isv4"
                  },
                  {
                    image: "/uploads/202610/20261010-7bz4wt.png",
                    title: "JSC-UL301",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524621509_zpqe"
                  }
                ]
              }
            ]
          },
          {
            title: "吉米",
            panels: [
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-m4clvg.jpg",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-vxwopl.png",
                    title: "M7Ultra",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524623060_z6sb"
                  },
                  {
                    image: "/uploads/202610/20261010-b6ib73.png",
                    title: "M7 Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524624571_zeay"
                  },
                  {
                    image: "/uploads/202610/20261010-z5bo0y.png",
                    title: "B6 Pro",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524625909_jbbs"
                  },
                  {
                    image: "/uploads/202610/20261010-r0l35c.png",
                    title: "M5",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524626874_vd4p"
                  }
                ]
              }
            ]
          },
          {
            title: "咖博士",
            panels: [
              {
                title: "",
                link: "",
                layout: "1",
                items: [
                  {
                    image: "/uploads/202610/20261010-2mpggx.png",
                    title: "",
                    desc: "",
                    linkMode: "whole",
                    link: ""
                  }
                ]
              },
              {
                title: "",
                link: "",
                layout: "2",
                items: [
                  {
                    image: "/uploads/202610/20261010-sx0cap.png",
                    title: "Grace 200",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524628569_nvh7"
                  },
                  {
                    image: "/uploads/202610/20261010-4shaim.png",
                    title: "H1S",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524629713_aa7s"
                  },
                  {
                    image: "/uploads/202610/20261010-yfsdnl.png",
                    title: "HOT 300",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524631618_c674"
                  },
                  {
                    image: "/uploads/202610/20261010-1d1o9m.png",
                    title: "HOT 100",
                    desc: "",
                    linkMode: "whole",
                    link: "/packageGoods/detail/detail?id=g_1791524632667_du0l"
                  }
                ]
              }
            ]
          }
        ],
        navLogo: "/uploads/202610/20261010-5drbld.png",
        link: "",
        switchMode: "page",
        navWidth: 26,
        contentPadX: 0,
        navStyle: "B",
        navBg: "#F1F1F1",
        navColor: "#050505",
        navColorActive: "#FFFFFF",
        navBgActive: "#000000",
        navBgIdle: "#F9F9F9",
        navBorderColor: "",
        navBorderLine: "#DDDDDD",
        navHeight: 45,
        navMargin: 1,
        navBorderH: 10,
        navBorderW: 1,
        navFontSize: 15,
        navWeight: "300",
        navWeightActive: "450",
        navAlign: "left",
        itemShadow: "none",
        itemBorderColor: "",
        itemTitleColor: "#323233",
        itemGapX: 0,
        itemGapY: 10,
        itemRadius: 0,
        itemTitleSize: 14,
        itemTitleWeight: "400",
        itemTitleAlign: "center",
        panelTitleColor: "#323233",
        panelTitleSize: 16,
        panelTitleWeight: "700",
        panelTitleAlign: "left",
        panelTitleGapX: 0,
        panelTitleGapY: 0,
        panelGap: 13,
        contentPadBottom: 0,
        effect: "none",
        effectSpeed: 1,
        effectDelay: 0.2,
        searchMode: "hide",
        bg: "#FFFFFF",
        moduleBgImage: "",
        moduleBgFill: "cover",
        reserveTabbar: false,
        navSticky: "off",
        heightMode: "screen"
      }
    ],
    meta: {
      desc: "",
      bg: "#F5F6F8",
      style: "standard"
    }
  },
  p288: {
    name: "了解莱克",
    blocks: [
      {
        id: "mgmv4qgmxd",
        type: "mixed_grid",
        subTitle: "UNDERSTAND LEXY",
        title: "了解莱克",
        titleAlign: "left",
        titleSize: 20,
        subSize: 16,
        titleWeight: "bold",
        subWeight: "normal",
        titleColor: "#444444",
        subColor: "#2E2B2B",
        titleGapTop: 45,
        titleGapBottom: 0,
        layout: "2-3",
        items: [
          {
            image: "/uploads/202610/20261012-kpg1zg.jpg",
            title: "关于莱克",
            link: "/pages/custom/index?key=p295"
          },
          {
            image: "/uploads/202610/20261012-da1l78.jpg",
            title: "新闻大事",
            link: "/pages/custom/index?key=p296"
          },
          {
            image: "/uploads/202610/20261012-x5pfpd.jpg",
            title: "创业故事",
            link: "/pages/custom/index?key=p297"
          },
          {
            image: "/uploads/202610/20261012-99qkmi.jpg",
            title: "我们品牌",
            link: "/pages/custom/index?key=p298"
          },
          {
            image: "/uploads/202610/20261012-nukv7o.jpg",
            title: "用户分享",
            link: "/pages/custom/index?key=p299"
          },
          {
            image: "/uploads/202610/20261012-48a4dw.jpg",
            title: "业务模式",
            link: "/pages/custom/index?key=p300"
          },
          {
            image: "/uploads/202610/20261012-5cweoj.jpg",
            title: "售后服务",
            link: "/pages/custom/index?key=p301"
          },
          {
            image: "/uploads/202610/20261012-1li7p4.jpg",
            title: "加入我们",
            link: "/pages/custom/index?key=p302"
          }
        ],
        cardStyle: "white",
        cardBg: "#F8F8F8",
        cardBgAlpha: 33,
        radius: "round",
        cardRadius: 8,
        imgRatio: "0.75",
        gap: 4.5,
        paddingInner: 8,
        paddingX: 7.5,
        paddingY: 0,
        itemTitleColor: "#444444",
        itemTitleSize: 14,
        itemTitleWeight: "bold",
        itemTitleAlign: "center",
        itemTitleLines: "1",
        bg: "#DFDEDE",
        anim: true
      }
    ],
    meta: {
      desc: "了解莱克 · 栏目入口",
      bg: "#F7F8FA",
      style: "standard"
    }
  },
  p295: {
    name: "关于莱克",
    blocks: [
      {
        id: "lnytk1d",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "rtytk1e",
        type: "rich_text",
        html: "<p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><strong><span style=\"font-size:24px;\">&nbsp; 关于莱克<br></span></strong></p><p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><span style=\"color:rgb(165 , 165 , 165);font-size:14px;\">&nbsp;&nbsp; 了解莱克认识莱克<br></span></p>",
        bg: "#F9F9F9",
        full: "0",
        pageMargin: 10
      },
      {
        id: "lnytk1f",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "lnytk1g",
        type: "line",
        style: "solid",
        height: 2,
        gapY: 10,
        color: "#E5E5E5",
        pageMargin: 15,
        bg: ""
      },
      {
        id: "tcytk1h",
        type: "tab_cate",
        layout: "1",
        tabs: [
          {
            name: "集团介绍",
            items: [
              {
                image: "/uploads/202610/20261012-5foqqv.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "CEO介绍",
            items: [
              {
                image: "/uploads/202610/20261012-9xf1dq.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "发展历程",
            items: [
              {
                image: "/uploads/202610/20261012-3ak3e5.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "莱克荣誉",
            items: [
              {
                image: "/uploads/202610/20261012-ruxlqg.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "品牌故事",
            items: [
              {
                image: "/uploads/202610/20261012-nejdus.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          }
        ],
        gapInner: 0,
        bgImage: "",
        titleColor: "#444444",
        tabColor: "#444444",
        tabActiveColor: "#444444",
        tabBg: "",
        bg: "",
        innerBg: "",
        gapOuter: 6,
        paddingX: 10,
        paddingTop: 10,
        paddingBottom: 10,
        cardStyle: "shadow",
        cardBg: "#FFFFFF",
        radius: "square",
        halfRound: true,
        imgRatio: "auto",
        showTitle: false,
        titleLines: "2",
        titleSize: 14,
        titleGapY: 12,
        titleGapX: 9,
        titleBold: "bold",
        titleAlign: "left",
        tabFontSize: 15,
        fit: "cover"
      }
    ],
    meta: {
      desc: "关于莱克 · 莱克资讯栏目",
      bg: "#F7F8FA",
      style: "standard"
    }
  },
  p296: {
    name: "新闻大事",
    blocks: [
      {
        id: "ln2hg1i",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "rt2hg1j",
        type: "rich_text",
        html: "<p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><strong><span style=\"font-size:24px;\">&nbsp;新闻大事</span></strong></p><p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><span style=\"color:rgb(165 , 165 , 165);font-size:14px;\">&nbsp; 实时把握莱克动态</span></p>",
        bg: "#F9F9F9",
        full: "0",
        pageMargin: 10
      },
      {
        id: "ln2hg1k",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "ln2hg1l",
        type: "line",
        style: "solid",
        height: 2,
        gapY: 10,
        color: "#E5E5E5",
        pageMargin: 15,
        bg: ""
      },
      {
        id: "tc2hg1m",
        type: "tab_cate",
        layout: "2",
        tabs: [
          {
            name: "新闻资讯",
            items: [
              {
                image: "/uploads/202610/20261012-p6a88s.jpg",
                video: "",
                title: "绿色赋能 实力出圈｜莱克电气成功发行江苏省首单上市民企绿色超短期融资券",
                link: "packageNews/note/note?id=212"
              },
              {
                image: "/uploads/202610/20261012-9bwde3.jpg",
                video: "",
                title: "莱克电气“四高十法”质量数字化赋能实践入选工信部典型案例",
                link: "packageNews/note/note?id=213"
              },
              {
                image: "/uploads/202610/20261012-86g5a2.jpg",
                video: "",
                title: "2026“新三件·新品质”AWE发布会精彩回顾",
                link: "packageNews/note/note?id=214"
              },
              {
                image: "/uploads/202610/20261012-dqfdxs.jpg",
                video: "",
                title: "莱克电气旗下三大品牌产品荣膺AWE2026艾普兰创新奖",
                link: "packageNews/note/note?id=215"
              },
              {
                image: "/uploads/202610/20261012-yf92l4.jpg",
                video: "",
                title: "权威认证加冕！莱克电气荣获“三合一洗地吸尘器开创者”认证，新品类定义清洁新标准",
                link: "packageNews/note/note?id=216"
              },
              {
                image: "/uploads/202610/20261012-7cyqfk.jpg",
                video: "",
                title: "莱克、碧云泉荣获2025中国家电行业\"好产品\"大奖",
                link: "packageNews/note/note?id=217"
              },
              {
                image: "/uploads/202610/20261012-0o9v8h.jpg",
                video: "",
                title: "苏宁易购深入莱克电气技术探讨共启11-1月战略攻势合作新篇章",
                link: "packageNews/note/note?id=218"
              },
              {
                image: "/uploads/202610/20261012-p6a88s.jpg",
                video: "",
                title: "莱克天狼星S10 Pro、碧云泉小积木G5领跑IFA家电创新赛道",
                link: "packageNews/note/note?id=219"
              },
              {
                image: "/uploads/202610/20261012-lh2cuk.jpg",
                video: "",
                title: "书香沁润职场，文化赋能未来“莱克新教育书房“正式授牌",
                link: "packageNews/note/note?id=220"
              },
              {
                image: "/uploads/202610/20261012-0zsu5z.jpg",
                video: "",
                title: "2025 莱克 | 碧云泉 | 咖博士新品体验发布会现场回顾",
                link: "packageNews/note/note?id=221"
              },
              {
                image: "/uploads/202610/20261012-68l2pi.jpg",
                video: "",
                title: "莱克电气AWE2025大放异彩，多项大奖彰显创新实力",
                link: "packageNews/note/note?id=222"
              },
              {
                image: "/uploads/202610/20261012-68l2pi.jpg",
                video: "",
                title: "喜讯 | 莱克入选首批中国消费名品，荣获“时代优品”认证",
                link: "packageNews/note/note?id=223"
              },
              {
                image: "/uploads/202610/20261012-aik88m.jpg",
                video: "",
                title: "喜讯 | 莱克荣获两项2024年中国家电行业年度“好产品”奖项",
                link: "packageNews/note/note?id=224"
              },
              {
                image: "/uploads/202610/20261012-rawzvv.jpg",
                video: "",
                title: "喜讯 | 莱克电气再获殊荣，荣登2024年度绿色制造名单",
                link: "packageNews/note/note?id=225"
              },
              {
                image: "/uploads/202610/20261012-ylcgut.jpg",
                video: "",
                title: "回望2024 见证非凡之旅",
                link: "packageNews/note/note?id=226"
              }
            ]
          },
          {
            name: "社会责任",
            items: [
              {
                image: "/uploads/202610/20261012-pf7vpc.jpg",
                video: "",
                title: "莱克集团:以公益心筑教育梦，携千年府学共赴未来",
                link: "packageNews/note/note?id=227"
              },
              {
                image: "/uploads/202610/20261012-pqt0qb.jpg",
                video: "",
                title: "行直道正，谊在千秋 | 莱克集团向苏州中学捐赠2000万",
                link: "packageNews/note/note?id=228"
              },
              {
                image: "/uploads/202610/20261012-47k5k9.jpg",
                video: "",
                title: "莱克电气助力上海疫情防控，捐赠410万元健康家电驰援上海方舱",
                link: "packageNews/note/note?id=229"
              }
            ]
          },
          {
            name: "财务报告",
            items: [
              {
                image: "/uploads/202610/20261012-90fkoo.jpg",
                video: "",
                title: "一图读懂莱克电气2025年半年报",
                link: "packageNews/note/note?id=230"
              },
              {
                image: "/uploads/202610/20261012-w3xww5.jpg",
                video: "",
                title: "一图读懂莱克电气2024年年报",
                link: "packageNews/note/note?id=231"
              },
              {
                image: "/uploads/202610/20261012-90fkoo.jpg",
                video: "",
                title: "一图读懂莱克电气2024年半年报",
                link: "packageNews/note/note?id=232"
              },
              {
                image: "/uploads/202610/20261012-mpdhzf.jpg",
                video: "",
                title: "一图读懂莱克电气2023年年报和2024年一季报",
                link: "packageNews/note/note?id=233"
              },
              {
                image: "/uploads/202610/20261012-y3jac7.jpg",
                video: "",
                title: "一图读懂莱克电气2023半年报",
                link: "packageNews/note/note?id=234"
              },
              {
                image: "/uploads/202610/20261012-k603zo.jpg",
                video: "",
                title: "一图读懂莱克电气2022年年报和2023年一季报",
                link: "packageNews/note/note?id=235"
              }
            ]
          }
        ],
        gapInner: 0,
        bgImage: "",
        titleColor: "#444444",
        tabColor: "#444444",
        tabActiveColor: "#444444",
        tabBg: "",
        bg: "",
        innerBg: "",
        gapOuter: 6,
        paddingX: 10,
        paddingTop: 10,
        paddingBottom: 10,
        cardStyle: "shadow",
        cardBg: "#FFFFFF",
        radius: "round",
        halfRound: false,
        imgRatio: "auto",
        showTitle: true,
        titleLines: "2",
        titleSize: 14,
        titleGapY: 12,
        titleGapX: 9,
        titleBold: "bold",
        titleAlign: "left",
        tabFontSize: 15,
        fit: "cover"
      }
    ],
    meta: {
      desc: "新闻大事 · 莱克资讯栏目",
      bg: "#F7F8FA",
      style: "standard"
    }
  },
  p297: {
    name: "创业故事",
    blocks: [
      {
        id: "vd6ir1n",
        type: "video",
        src: "/uploads/202610/20261012-n65axg.mp4",
        poster: "/uploads/202610/20261012-f46knx.jpg",
        height: 420,
        pageMargin: 0,
        radius: "square",
        autoplay: false,
        muted: true,
        controls: true,
        loop: false
      },
      {
        id: "cc6ir1o",
        type: "content_card",
        title: "",
        cols: "1",
        ratio: "0.75",
        imgHeight: 147,
        items: [
          {
            image: "/uploads/202610/20261012-rmi5x5.jpg",
            title: "创业语录-辞职下海（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-fiu3f1.jpg",
            title: "创业语录-龙头老大（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-p5w46r.jpg",
            title: "创业语录-目标愿景（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-q318hq.jpg",
            title: "创业语录-立身之本（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-97frov.jpg",
            title: "创业语录-创造价值（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-g1dn6z.jpg",
            title: "创业语录-产品至上（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-zftwh9.jpg",
            title: "创业语录-生意理念（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-a7iod8.jpg",
            title: "创业语录-与众不同（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-ixvtkg.jpg",
            title: "创业语录-经营管理（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-qbolqw.jpg",
            title: "创业语录-终身学习（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-abufl4.jpg",
            title: "创业语录-因时而变（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-a44624.jpg",
            title: "创业语录-辩证思维（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-ixjrqv.jpg",
            title: "创业语录-居安思危（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-ecn4pz.jpg",
            title: "创业语录-与时俱进（点击查看视频）",
            desc: "",
            link: ""
          },
          {
            image: "/uploads/202610/20261012-opmkgd.jpg",
            title: "创业语录-莱克使命（点击查看视频）",
            desc: "",
            link: ""
          }
        ],
        style: "shadow",
        radius: "round",
        showTag: false,
        showRead: false,
        showLike: false,
        more: false,
        moreText: "查看更多",
        link: "",
        pageMargin: 15,
        padY: 18,
        gapX: 0,
        gapY: 5,
        titleSize: 16,
        titleWeight: "bold",
        titleLineHeight: 22,
        titleAlign: "left",
        titleColor: "#323233",
        titlePadX: 10,
        titlePadY: 10
      },
      {
        id: "im6ir1p",
        type: "image",
        src: "/uploads/202610/20261012-wys5is.jpg",
        height: 210,
        pageMargin: 0,
        radius: "square",
        link: ""
      }
    ],
    meta: {
      desc: "创业故事 · 莱克资讯栏目",
      bg: "#FFFFFF",
      style: "standard"
    }
  },
  p298: {
    name: "我们品牌",
    blocks: [
      {
        id: "lnav81q",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "rtav81r",
        type: "rich_text",
        html: "<p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><strong><span style=\"font-size:24px;\">&nbsp; 我们品牌</span></strong></p><p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><span style=\"color:rgb(165 , 165 , 165);font-size:14px;\">&nbsp;&nbsp; 了解莱克四大品牌</span></p>",
        bg: "#F9F9F9",
        full: "0",
        pageMargin: 10
      },
      {
        id: "lnav81s",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "lnav81t",
        type: "line",
        style: "solid",
        height: 2,
        gapY: 10,
        color: "#E5E5E5",
        pageMargin: 15,
        bg: ""
      },
      {
        id: "tcav81u",
        type: "tab_cate",
        layout: "1",
        tabs: [
          {
            name: "莱克",
            items: [
              {
                image: "/uploads/202610/20261012-elgfpt.jpg",
                video: "",
                title: "",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-xuqpd7.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "碧云泉",
            items: [
              {
                image: "/uploads/202610/20261012-byp8px.jpg",
                video: "",
                title: "",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-66b92k.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "咖博士",
            items: [
              {
                image: "/uploads/202610/20261012-g5ctzt.jpg",
                video: "",
                title: "",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-dgo59f.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "吉米",
            items: [
              {
                image: "/uploads/202610/20261012-1rim2k.jpg",
                video: "",
                title: "",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-26bocz.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          }
        ],
        gapInner: 0,
        bgImage: "",
        titleColor: "#444444",
        tabColor: "#444444",
        tabActiveColor: "#444444",
        tabBg: "",
        bg: "",
        innerBg: "",
        gapOuter: 0,
        paddingX: 10,
        paddingTop: 10,
        paddingBottom: 10,
        cardStyle: "shadow",
        cardBg: "#FFFFFF",
        radius: "square",
        halfRound: true,
        imgRatio: "auto",
        showTitle: false,
        titleLines: "2",
        titleSize: 14,
        titleGapY: 12,
        titleGapX: 9,
        titleBold: "bold",
        titleAlign: "left",
        tabFontSize: 17,
        fit: "cover"
      }
    ],
    meta: {
      desc: "我们品牌 · 莱克资讯栏目",
      bg: "#F7F8FA",
      style: "standard"
    }
  },
  p299: {
    name: "用户分享",
    blocks: [
      {
        id: "lnfhc1v",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "rtfhc1w",
        type: "rich_text",
        html: "<p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><strong><span style=\"font-size:24px;\">&nbsp; 用户分享</span></strong></p><p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><span style=\"color:rgb(165 , 165 , 165);font-size:14px;\">&nbsp;&nbsp; 莱克产品使用体验</span></p>",
        bg: "#F9F9F9",
        full: "0",
        pageMargin: 10
      },
      {
        id: "lnfhc1x",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "lnfhc1y",
        type: "line",
        style: "solid",
        height: 2,
        gapY: 10,
        color: "#E5E5E5",
        pageMargin: 15,
        bg: ""
      },
      {
        id: "tcfhc1z",
        type: "tab_cate",
        layout: "2",
        tabs: [
          {
            name: "城市探店",
            items: [
              {
                image: "/uploads/202610/20261012-908jee.jpg",
                video: "",
                title: "冲京东Mall挖到莱克 ，吸尘洗地除螨一步到位",
                link: "packageNews/note/note?id=236"
              },
              {
                image: "/uploads/202610/20261012-rgu5bk.jpg",
                video: "",
                title: "上海 AWE 焦点！莱克天狼星，一站式解决家务",
                link: "packageNews/note/note?id=237"
              },
              {
                image: "/uploads/202610/20261012-l7d0n6.jpg",
                video: "",
                title: "从清洁黑科技到生活美学，这里藏着多少惊喜？",
                link: "packageNews/note/note?id=238"
              },
              {
                image: "/uploads/202610/20261012-4a2820.jpg",
                video: "",
                title: "莱克品质生活，邂逅山城魅力！",
                link: "packageNews/note/note?id=239"
              },
              {
                image: "/uploads/202610/20261012-3jb1eg.jpg",
                video: "",
                title: "主持人刘帅亲探潍坊三联家电！沉浸式体验莱克天狼星~",
                link: "packageNews/note/note?id=240"
              },
              {
                image: "/uploads/202610/20261012-q9tcvg.jpg",
                video: "",
                title: "逛利群家里不白来！青岛人专属莱克天狼星实测",
                link: "packageNews/note/note?id=241"
              },
              {
                image: "/uploads/202610/20261012-xrfspg.jpg",
                video: "",
                title: "天狼星550W大吸力 “卷” 进济宁九龙家电",
                link: "packageNews/note/note?id=242"
              },
              {
                image: "/uploads/202610/20261012-dybs3k.jpg",
                video: "",
                title: "跟着主持人张杰逛北国电器：石家庄的隐藏福利",
                link: "packageNews/note/note?id=243"
              },
              {
                image: "/uploads/202610/20261012-kz253h.jpg",
                video: "",
                title: "探同利家电天狼星：包头 “包” 藏清洁礼",
                link: "packageNews/note/note?id=244"
              }
            ]
          },
          {
            name: "精选内容",
            items: [
              {
                image: "/uploads/202610/20261012-f0emne.jpg",
                video: "",
                title: "演员费启鸣晒新家，好夏日配好水",
                link: "packageNews/note/note?id=245"
              },
              {
                image: "/uploads/202610/20261012-7sttg9.jpg",
                video: "",
                title: "杨子姗亲测！模块随心搭解锁冰饮自由",
                link: "packageNews/note/note?id=246"
              },
              {
                image: "/uploads/202610/20261012-f9lu0i.jpg",
                video: "",
                title: "李思思的24小时喝水养生秘诀",
                link: "packageNews/note/note?id=247"
              },
              {
                image: "/uploads/202610/20261012-coga7l.jpg",
                video: "",
                title: "跟着“顿顿”一起解锁夏日饮水黑科技",
                link: "packageNews/note/note?id=248"
              },
              {
                image: "/uploads/202610/20261012-p0yr2l.jpg",
                video: "",
                title: "带三个娃还能精致生活？全靠这台天狼星「一键善后」",
                link: "packageNews/note/note?id=249"
              },
              {
                image: "/uploads/202610/20261012-jd47o7.jpg",
                video: "",
                title: "科技让爱更纯净，让生活更轻松",
                link: "packageNews/note/note?id=250"
              },
              {
                image: "/uploads/202610/20261012-eimeem.jpg",
                video: "",
                title: "于AWE人潮中，邂逅“智能”惊喜",
                link: "packageNews/note/note?id=251"
              },
              {
                image: "/uploads/202610/20261012-pq7e4o.jpg",
                video: "",
                title: "莱克30周年！感受来自苏州的洁净吧！",
                link: "packageNews/note/note?id=252"
              },
              {
                image: "/uploads/202610/20261012-du8bf2.jpg",
                video: "",
                title: "回归生活本真秩序，找寻「净」的新境界",
                link: "packageNews/note/note?id=253"
              },
              {
                image: "/uploads/202610/20261012-yz9q58.jpg",
                video: "",
                title: "在百年故居花园体验“江南之净 ”的一天",
                link: "packageNews/note/note?id=254"
              }
            ]
          },
          {
            name: "用户故事",
            items: [
              {
                image: "/uploads/202610/20261012-lr2m1f.jpg",
                video: "",
                title: "净家致心安",
                link: "packageNews/note/note?id=255"
              },
              {
                image: "/uploads/202610/20261012-omoq97.jpg",
                video: "",
                title: "梦想居所，莱克天王星U7成就洁净之美",
                link: "packageNews/note/note?id=256"
              },
              {
                image: "/uploads/202610/20261012-0txyt1.jpg",
                video: "",
                title: "向不凡而生的家",
                link: "packageNews/note/note?id=257"
              },
              {
                image: "/uploads/202610/20261012-hn6etr.jpg",
                video: "",
                title: "情绪流动收容所",
                link: "packageNews/note/note?id=258"
              },
              {
                image: "/uploads/202610/20261012-lxddto.jpg",
                video: "",
                title: "本真归真 洁来洁往",
                link: "packageNews/note/note?id=259"
              },
              {
                image: "/uploads/202610/20261012-fstns7.jpg",
                video: "",
                title: "挖掘记忆深处的故事",
                link: "packageNews/note/note?id=260"
              },
              {
                image: "/uploads/202610/20261012-2pqaul.jpg",
                video: "",
                title: "“绅士”养成计划",
                link: "packageNews/note/note?id=261"
              }
            ]
          },
          {
            name: "品牌挚友",
            items: [
              {
                image: "/uploads/202610/20261012-yzdqe8.jpg",
                video: "",
                title: "智净未来，健康生活",
                link: "packageNews/note/note?id=221"
              },
              {
                image: "/uploads/202610/20261012-yieb2k.jpg",
                video: "",
                title: "器之净美 归于心安",
                link: "packageNews/note/note?id=262"
              },
              {
                image: "/uploads/202610/20261012-liqf60.jpg",
                video: "",
                title: "生活有净气 灵魂有香气",
                link: "packageNews/note/note?id=263"
              },
              {
                image: "/uploads/202610/20261012-zkwsgg.jpg",
                video: "",
                title: "诗意之宅 造景入室",
                link: "packageNews/note/note?id=264"
              },
              {
                image: "/uploads/202610/20261012-rr1w2i.jpg",
                video: "",
                title: "寻得隐秘“天堂” 享足自然之乐",
                link: "packageNews/note/note?id=265"
              }
            ]
          },
          {
            name: "品牌期刊",
            items: [
              {
                image: "/uploads/202610/20261012-fbdpu2.jpg",
                video: "",
                title: "",
                link: "packageNews/note/note?id=266"
              },
              {
                image: "/uploads/202610/20261012-rhi52h.jpg",
                video: "",
                title: "",
                link: "packageNews/note/note?id=267"
              },
              {
                image: "/uploads/202610/20261012-n3nxod.jpg",
                video: "",
                title: "",
                link: "packageNews/note/note?id=268"
              },
              {
                image: "/uploads/202610/20261012-eitl82.jpg",
                video: "",
                title: "",
                link: "packageNews/note/note?id=269"
              },
              {
                image: "/uploads/202610/20261012-lgznz2.jpg",
                video: "",
                title: "",
                link: "packageNews/note/note?id=270"
              },
              {
                image: "/uploads/202610/20261012-hwco61.jpg",
                video: "",
                title: "",
                link: "packageNews/note/note?id=271"
              }
            ]
          }
        ],
        gapInner: 0,
        bgImage: "",
        titleColor: "#444444",
        tabColor: "#444444",
        tabActiveColor: "#444444",
        tabBg: "",
        bg: "",
        innerBg: "",
        gapOuter: 5,
        paddingX: 10,
        paddingTop: 10,
        paddingBottom: 10,
        cardStyle: "white",
        cardBg: "#FFFFFF",
        radius: "round",
        halfRound: false,
        imgRatio: "auto",
        showTitle: true,
        titleLines: "2",
        titleSize: 11,
        titleGapY: 12,
        titleGapX: 10,
        titleBold: "bold",
        titleAlign: "center",
        tabFontSize: 15,
        fit: "cover"
      }
    ],
    meta: {
      desc: "用户分享 · 莱克资讯栏目",
      bg: "#F7F8FA",
      style: "standard"
    }
  },
  p300: {
    name: "业务模式",
    blocks: [
      {
        id: "lnkhi20",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "rtkhi21",
        type: "rich_text",
        html: "<p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><strong><span style=\"font-size:24px;\">&nbsp; 业务模式<br></span></strong></p><p style=\"line-height:normal;margin-top:5px;margin-bottom:5px;\"><span style=\"color:rgb(165 , 165 , 165);font-size:14px;\">&nbsp;&nbsp; 持之以恒精益求精</span></p>",
        bg: "#F9F9F9",
        full: "0",
        pageMargin: 10
      },
      {
        id: "lnkhi22",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "lnkhi23",
        type: "line",
        style: "solid",
        height: 2,
        gapY: 10,
        color: "#E5E5E5",
        pageMargin: 15,
        bg: ""
      },
      {
        id: "tckhi24",
        type: "tab_cate",
        layout: "1",
        tabs: [
          {
            name: "国内自主品牌",
            items: [
              {
                image: "/uploads/202610/20261012-crbmr4.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "国外OEM/ODM",
            items: [
              {
                image: "/uploads/202610/20261012-q3zbio.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          },
          {
            name: "核心零部件",
            items: [
              {
                image: "/uploads/202610/20261012-blb54q.jpg",
                video: "",
                title: "",
                link: ""
              }
            ]
          }
        ],
        gapInner: 0,
        bgImage: "",
        titleColor: "#444444",
        tabColor: "#444444",
        tabActiveColor: "#444444",
        tabBg: "",
        bg: "",
        innerBg: "",
        gapOuter: 6,
        paddingX: 11,
        paddingTop: 5,
        paddingBottom: 11,
        cardStyle: "shadow",
        cardBg: "#FFFFFF",
        radius: "round",
        halfRound: true,
        imgRatio: "auto",
        showTitle: false,
        titleLines: "2",
        titleSize: 14,
        titleGapY: 12,
        titleGapX: 9,
        titleBold: "bold",
        titleAlign: "left",
        tabFontSize: 14,
        fit: "cover"
      }
    ],
    meta: {
      desc: "业务模式 · 莱克资讯栏目",
      bg: "#F7F8FA",
      style: "standard"
    }
  },
  p301: {
    name: "售后服务",
    blocks: [
      {
        id: "lnpxw25",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "rtpxw26",
        type: "rich_text",
        html: "<p>&nbsp;&nbsp; <strong><span style=\"font-size:24px;\">售后服务<br></span></strong><span style=\"color:rgb(165 , 165 , 165);font-size:14px;\">&nbsp;&nbsp; 产品售后与使用指南</span></p>",
        bg: "#F9F9F9",
        full: "0",
        pageMargin: 10
      },
      {
        id: "lnpxw27",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "lnpxw28",
        type: "line",
        style: "solid",
        height: 2,
        gapY: 10,
        color: "#E5E5E5",
        pageMargin: 15,
        bg: ""
      },
      {
        id: "elpxw2k",
        type: "elevator",
        mode: "scroll",
        styleType: "theme",
        tagStyle: "bg",
        items: [
          {
            text: "小莱到家",
            target: 6
          },
          {
            text: "操作指南",
            target: 8
          },
          {
            text: "售后政策",
            target: 14
          }
        ],
        color: "#969799",
        activeColor: "#000000",
        bg: "#FFFFFF",
        pageMargin: 8
      },
      {
        id: "ttpxw29",
        type: "title",
        text: "小莱到家",
        sub: "",
        size: "md",
        align: "center",
        bold: true,
        color: "#323233",
        bg: "#FFFFFF",
        link: "",
        pageMargin: 16,
        paddingY: 16
      },
      {
        id: "impxw2a",
        type: "image",
        src: "/uploads/202610/20261012-5ukejk.jpg",
        height: 353,
        pageMargin: 0,
        radius: "square",
        link: ""
      },
      {
        id: "ttpxw2b",
        type: "title",
        text: "操作指南",
        sub: "",
        size: "md",
        align: "center",
        bold: true,
        color: "#323233",
        bg: "#FFFFFF",
        link: "",
        pageMargin: 16,
        paddingY: 16
      },
      {
        id: "impxw2c",
        type: "image",
        src: "/uploads/202610/20261012-07801w.jpg",
        height: 176,
        pageMargin: 0,
        radius: "square",
        link: ""
      },
      {
        id: "impxw2d",
        type: "image",
        src: "/uploads/202610/20261012-ow4yfh.jpg",
        height: 176,
        pageMargin: 0,
        radius: "square",
        link: ""
      },
      {
        id: "impxw2e",
        type: "image",
        src: "/uploads/202610/20261012-um665o.jpg",
        height: 176,
        pageMargin: 0,
        radius: "square",
        link: ""
      },
      {
        id: "impxw2f",
        type: "image",
        src: "/uploads/202610/20261012-9ysr3o.jpg",
        height: 176,
        pageMargin: 0,
        radius: "square",
        link: ""
      },
      {
        id: "lnpxw2g",
        type: "line",
        style: "blank",
        height: 60,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "ttpxw2h",
        type: "title",
        text: "售后政策",
        sub: "",
        size: "md",
        align: "center",
        bold: true,
        color: "#323233",
        bg: "#FFFFFF",
        link: "",
        pageMargin: 16,
        paddingY: 16
      },
      {
        id: "impxw2i",
        type: "image",
        src: "/uploads/202610/20261012-0f1tx8.jpg",
        height: 562,
        pageMargin: 0,
        radius: "square",
        link: ""
      },
      {
        id: "impxw2j",
        type: "image",
        src: "/uploads/202610/20261012-x6t10h.jpg",
        height: 562,
        pageMargin: 0,
        radius: "square",
        link: ""
      }
    ],
    meta: {
      desc: "售后服务 · 莱克资讯栏目",
      bg: "#F9F9F9",
      style: "standard"
    }
  },
  p302: {
    name: "加入我们",
    blocks: [
      {
        id: "lnvon2l",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "rtvon2m",
        type: "rich_text",
        html: "<p style=\"margin-bottom:5px;text-wrap:wrap;line-height:normal;\"><strong><span style=\"font-size:24px;\">&nbsp; 加入我们</span></strong></p><p style=\"margin-bottom:5px;text-wrap:wrap;line-height:normal;\"><span style=\"color:rgb(165 , 165 , 165);font-size:14px;\">&nbsp; &nbsp;价值理念与人才需求</span></p>",
        bg: "#F9F9F9",
        full: "0",
        pageMargin: 10
      },
      {
        id: "lnvon2n",
        type: "line",
        style: "blank",
        height: 16,
        pageMargin: 0,
        color: "#EEEEEE",
        bg: ""
      },
      {
        id: "lnvon2o",
        type: "line",
        style: "solid",
        height: 2,
        gapY: 10,
        color: "#E5E5E5",
        pageMargin: 15,
        bg: ""
      },
      {
        id: "tcvon2p",
        type: "tab_cate",
        layout: "1",
        tabs: [
          {
            name: "人才理念",
            items: [
              {
                image: "/uploads/202610/20261012-95w8ye.jpg",
                video: "",
                title: "四星计划",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-j955te.jpg",
                video: "",
                title: "阳光计划",
                link: ""
              }
            ]
          },
          {
            name: "价值主张",
            items: [
              {
                image: "/uploads/202610/20261012-0fbfi2.jpg",
                video: "",
                title: "员工六大行为准则",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-3r39z4.jpg",
                video: "",
                title: "核心价值观、使命与愿景",
                link: ""
              }
            ]
          },
          {
            name: "人才需求",
            items: [
              {
                image: "/uploads/202610/20261012-p40g5k.jpg",
                video: "",
                title: "宣讲现场",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-dv6f0r.jpg",
                video: "",
                title: "岗位需求",
                link: ""
              }
            ]
          },
          {
            name: "员工风采",
            items: [
              {
                image: "/uploads/202610/20261012-4lkkt4.jpg",
                video: "",
                title: "元宵节活动",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-atph9a.jpg",
                video: "",
                title: "妇女节活动",
                link: ""
              },
              {
                image: "/uploads/202610/20261012-xyv67y.jpg",
                video: "",
                title: "趣味运动会",
                link: ""
              }
            ]
          }
        ],
        gapInner: 0,
        bgImage: "",
        titleColor: "#444444",
        tabColor: "#444444",
        tabActiveColor: "#444444",
        tabBg: "",
        bg: "",
        innerBg: "",
        gapOuter: 0,
        paddingX: 10,
        paddingTop: 10,
        paddingBottom: 10,
        cardStyle: "white",
        cardBg: "#FFFFFF",
        radius: "round",
        halfRound: false,
        imgRatio: "auto",
        showTitle: true,
        titleLines: "2",
        titleSize: 14,
        titleGapY: 12,
        titleGapX: 10,
        titleBold: "bold",
        titleAlign: "left",
        tabFontSize: 15,
        fit: "cover"
      }
    ],
    meta: {
      desc: "加入我们 · 莱克资讯栏目",
      bg: "#F7F8FA",
      style: "standard"
    }
  },
  p481: {
    name: "有赞首页复刻",
    blocks: [
      {
        type: "swiper",
        mode: "poster",
        height: 1322,
        radius: "square",
        interval: 4500,
        indicator: "dots",
        pageMargin: 0,
        imageGap: 0,
        images: [
          {
            image: "/uploads/202610/20261009-86caac-Fo69HIsVHfOzMC08PSX7N7uFY8s1.webp",
            link: "/packageGoods/detail/detail?id=g1003972"
          },
          {
            image: "/uploads/202610/20261009-44f4b4-Fl6yiLDP_qD77xcIPwrKfpbdgn3l.webp",
            link: "/packageGoods/detail/detail?id=g1003972"
          }
        ]
      },
      {
        type: "video",
        height: 420,
        src: "/uploads/202610/20261009-huuw56.mp4",
        poster: "/uploads/202610/20261009-7c88cd-FmWuKKYDvg5Wt4aDDF0BzrOtFjJ6.webp",
        autoplay: false,
        muted: true,
        controls: false,
        loop: false,
        radius: "square",
        pageMargin: 0
      },
      {
        type: "image",
        height: 1342,
        src: "/uploads/202610/20261009-e2a92a-FpEmv38JlZ6Gs7uqOc3Oc45c8ZyO.webp",
        radius: "square",
        pageMargin: 0,
        link: ""
      },
      {
        type: "line",
        style: "blank",
        height: 48,
        gapY: 0,
        color: "#EEEEEE",
        bg: "",
        pageMargin: 0
      },
      {
        type: "image",
        height: 1642,
        src: "/uploads/202610/20261009-f8b64b-Fs2JC2Rd_zFcdWuYOzLkNR_PKFP8.webp",
        radius: "square",
        pageMargin: 0,
        link: ""
      },
      {
        type: "video",
        height: 420,
        src: "/uploads/202610/20261009-f632ky.mp4",
        poster: "/uploads/202610/20261009-7a46e4-FuFIgF8CRwJ0Ea6su5y3izD9gGKe.webp",
        autoplay: false,
        muted: true,
        controls: false,
        loop: false,
        radius: "square",
        pageMargin: 0
      },
      {
        type: "image",
        height: 756,
        src: "/uploads/202610/20261009-0a2785-Fr_tsF2gAxM2M35MG16j34djUjZs.webp",
        radius: "square",
        pageMargin: 0,
        link: ""
      },
      {
        type: "image",
        height: 1326,
        src: "/uploads/202610/20261009-a25845-FhZ_bsHU5p4qvtJlg5a7rprmsHhB.webp",
        radius: "square",
        pageMargin: 0,
        link: ""
      },
      {
        type: "video",
        height: 420,
        src: "/uploads/202610/20261009-pj6lis.mp4",
        poster: "/uploads/202610/20261009-6a796a-XvLEB33Z0lZ-QiYQ2eRMzI899fRo2arKyE_6qg_c.jpg",
        autoplay: false,
        muted: true,
        controls: false,
        loop: false,
        radius: "square",
        pageMargin: 0
      },
      {
        type: "image",
        height: 652,
        src: "/uploads/202610/20261009-fe18b3-FhkZ06W7Z8D16Cd0ULEu700z0_kr.webp",
        radius: "square",
        pageMargin: 0,
        link: ""
      },
      {
        type: "image",
        height: 882,
        src: "/uploads/202610/20261009-b8a41a-Fs-nj3UEvr_44TFpny7zs8_0TZB2.webp",
        radius: "square",
        pageMargin: 0,
        link: ""
      },
      {
        type: "video",
        height: 420,
        src: "/uploads/202610/20261009-wvq94t.mp4",
        poster: "/uploads/202610/20261009-db6432-J2S8RqWN_Lla-3X3b99IvkTEmX4tvEsMaSCWog_c.jpg",
        autoplay: false,
        muted: true,
        controls: false,
        loop: false,
        radius: "square",
        pageMargin: 0
      },
      {
        type: "image",
        height: 598,
        src: "/uploads/首页/FtvYjCwh63g2WYeVU7Pm9nY5wmpc.png",
        radius: "square",
        pageMargin: 0,
        link: ""
      },
      {
        type: "swiper",
        mode: "single",
        height: 2052,
        radius: "square",
        interval: 4500,
        indicator: "dots",
        pageMargin: 0,
        imageGap: 0,
        images: [
          {
            image: "/uploads/首页/FqUkbtDssN5a_bkdNKxqI6XM12dL.png",
            link: ""
          },
          {
            image: "/uploads/首页/Fr1uBwoTH6nnNiPQgRhte1Pa84N0.png",
            link: ""
          },
          {
            image: "/uploads/首页/FgEGHs0O89DzGGM7yML3Lmg318PO.png",
            link: ""
          }
        ]
      }
    ],
    meta: {
      desc: "有赞首页复刻",
      bg: "#F2EDE7",
      style: "immersive"
    }
  },
  homebak: {
    name: "原首页（换版前备份）",
    blocks: [
      {
        type: "swiper",
        height: 1322,
        images: [
          {
            image: "/uploads/202610/20261009-86caac-Fo69HIsVHfOzMC08PSX7N7uFY8s1.webp",
            link: "/packageGoods/detail/detail?id=g1003972"
          },
          {
            image: "/uploads/202610/20261009-44f4b4-Fl6yiLDP_qD77xcIPwrKfpbdgn3l.webp",
            link: "/packageGoods/detail/detail?id=g1003972"
          }
        ]
      },
      {
        type: "video",
        height: 420,
        poster: "/uploads/202610/20261009-7c88cd-FmWuKKYDvg5Wt4aDDF0BzrOtFjJ6.webp",
        src: "/uploads/202610/20261009-huuw56.mp4"
      },
      {
        type: "image",
        height: 1342,
        src: "/uploads/202610/20261009-e2a92a-FpEmv38JlZ6Gs7uqOc3Oc45c8ZyO.webp"
      },
      {
        type: "image",
        height: 1642,
        src: "/uploads/202610/20261009-f8b64b-Fs2JC2Rd_zFcdWuYOzLkNR_PKFP8.webp"
      },
      {
        type: "video",
        height: 420,
        poster: "/uploads/202610/20261009-7a46e4-FuFIgF8CRwJ0Ea6su5y3izD9gGKe.webp",
        src: "/uploads/202610/20261009-f632ky.mp4"
      },
      {
        type: "image",
        height: 756,
        src: "/uploads/202610/20261009-0a2785-Fr_tsF2gAxM2M35MG16j34djUjZs.webp"
      },
      {
        type: "image",
        height: 1326,
        src: "/uploads/202610/20261009-a25845-FhZ_bsHU5p4qvtJlg5a7rprmsHhB.webp"
      },
      {
        type: "video",
        height: 420,
        poster: "/uploads/202610/20261009-6a796a-XvLEB33Z0lZ-QiYQ2eRMzI899fRo2arKyE_6qg_c.jpg",
        src: "/uploads/202610/20261009-pj6lis.mp4"
      },
      {
        type: "image",
        height: 652,
        src: "/uploads/202610/20261009-fe18b3-FhkZ06W7Z8D16Cd0ULEu700z0_kr.webp"
      },
      {
        type: "image",
        height: 882,
        src: "/uploads/202610/20261009-b8a41a-Fs-nj3UEvr_44TFpny7zs8_0TZB2.webp"
      },
      {
        type: "video",
        height: 420,
        poster: "/uploads/202610/20261009-db6432-J2S8RqWN_Lla-3X3b99IvkTEmX4tvEsMaSCWog_c.jpg",
        src: "/uploads/202610/20261009-wvq94t.mp4"
      }
    ],
    meta: {
      desc: "新版首页！！",
      bg: "#F5F6F8",
      style: "standard"
    }
  }
};

/** ---------------- 店铺笔记（id → { header, body, blocks }，由装修台「店铺笔记」创建） ---------------- */
const SHOPNOTES = {
  "212": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "绿色赋能 实力出圈｜莱克电气成功发行江苏省首单上市民企绿色超短期融资券",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-p6a88s.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115228349,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-card__left novel-card__new-only\"><div class=\"novel-card__cover\"></div><div class=\"novel-card__text\"><div class=\"novel-card__main\">在小说阅读器读本章</div><div class=\"novel-card__subtitle\"></div></div></div><div class=\"novel-card__link novel-card__new-only\">去阅读</div><div class=\"novel-info novel-card__old-only\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\">在公众号小说中沉浸阅读</div></div></div></div><div class=\"arrow-jump-icon novel-card__old-only\"></div></div><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section data-role=\"outer\" style=\"\"><section data-role=\"paragraph\"><section style=\"text-align:center;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503093870\" data-ratio=\"9.166666666666666\" data-src=\"/uploads/202610/20261016-pq6swr.jpg\" data-type=\"jpeg\" data-w=\"1080\" src=\"/uploads/202610/20261016-pq6swr.jpg\" style=\"height:auto;\" /></section><section data-role=\"outer\" label=\"edit by 135editor\"><section data-role=\"paragraph\" data-pm-slice=\"3 7 ['para',{'tagName':'section','attributes':{'data-role':'outer','label':'edit by 135editor'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section data-role=\"outer\" label=\"edit by 135editor\" data-pm-slice=\"0 0 []\"><section data-tools=\"135编辑器\" data-id=\"171952\"><section data-op=\"division\" style=\"margin:10px auto;\"><section style=\"display:flex;justify-content:space-between;margin-top:2%;\"><section style=\"width:49%;box-sizing:border-box;max-width:49% !important;\" data-width=\"49%\"><section style=\"width:100%;max-width:100% !important;box-sizing:border-box;\" data-width=\"100%\" nodeleaf=\"\"></section></section></section></section></section></section></section></section></section></section><p style=\"display:none;\"></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div></div><div></div><div class=\"rich_media_tool_area\"><div class=\"rich_media_tool__wrp\"></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div></div></div><p></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "213": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克电气“四高十法”质量数字化赋能实践入选工信部典型案例",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-9bwde3.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114775476,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-card__left novel-card__new-only\"><div class=\"novel-card__cover\"></div><div class=\"novel-card__text\"><div class=\"novel-card__main\">在小说阅读器读本章</div><div class=\"novel-card__subtitle\"></div></div></div><div class=\"novel-card__link novel-card__new-only\">去阅读</div><div class=\"novel-info novel-card__old-only\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\">在公众号小说中沉浸阅读</div></div></div></div><div class=\"arrow-jump-icon novel-card__old-only\"></div></div><div class=\"rich_media_content js_underline_content autoTypeSetting24psection \" style=\"visibility:visible;opacity:1;\"><section data-role=\"outer\" label=\"edit by 135editor\" data-pm-slice=\"0 0 []\"><section data-tools=\"135编辑器\" data-id=\"125360\"><section style=\"text-align:center;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503093682\" data-ratio=\"1.5416666666666667\" data-src=\"/uploads/202610/20261016-ymx8bh.png\" data-type=\"png\" data-w=\"1080\" src=\"/uploads/202610/20261016-ymx8bh.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-mrhdu5.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.8064814814814816\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093683\" src=\"/uploads/202610/20261016-mrhdu5.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-bdnht1.png\" class=\"rich_pages wxw-img\" data-ratio=\"3.028703703703704\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093685\" src=\"/uploads/202610/20261016-bdnht1.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-vo9lde.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.2851851851851852\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093684\" src=\"/uploads/202610/20261016-vo9lde.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\"><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\"><br /><br /></section></section></section></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "214": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "2026“新三件·新品质”AWE发布会精彩回顾",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-86g5a2.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115530497,
    body: {
      html: "<div><div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-info\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\">在小说阅读器中沉浸阅读</div></div></div></div><div class=\"arrow-jump-icon\"></div></div><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-nqqmte.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.462037037037037\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093123\" src=\"/uploads/202610/20261016-nqqmte.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-7cbvvk.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.9879629629629629\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093124\" src=\"/uploads/202610/20261016-7cbvvk.png\" style=\"height:auto;\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section><span leaf=\"\"><br /></span></section><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-s68f00.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.5046296296296297\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:586px;box-sizing:border-box;height:auto;\" data-imgfileid=\"503093164\" src=\"/uploads/202610/20261016-s68f00.png\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-13ltaf.png\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.6342592592592593\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093126\" src=\"/uploads/202610/20261016-13ltaf.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-f9ppgk.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.6425925925925926\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093127\" src=\"/uploads/202610/20261016-f9ppgk.png\" style=\"height:auto;\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-ufx1oa.png\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"1.8425925925925926\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093148\" src=\"/uploads/202610/20261016-ufx1oa.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-8weuny.png\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"1.0324074074074074\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093149\" src=\"/uploads/202610/20261016-8weuny.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-a9f3vl.gif\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.5633802816901409\" data-type=\"gif\" data-w=\"568\" data-imgfileid=\"503093136\" src=\"/uploads/202610/20261016-a9f3vl.gif\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-8zj9af.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.6620370370370371\" data-type=\"png\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503093129\" src=\"/uploads/202610/20261016-8zj9af.jpg\" /></section></section></section></div></div></div></div></div></div><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-clmpyd.png\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"2.075925925925926\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093130\" src=\"/uploads/202610/20261016-clmpyd.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-7qgv3x.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.575\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093144\" src=\"/uploads/202610/20261016-7qgv3x.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=2orpm779cb2li7t&shopAutoEnter=1\"><img data-src=\"/uploads/202610/20261016-oa9ywn.gif\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.5633802816901409\" data-type=\"gif\" data-w=\"568\" data-imgfileid=\"503093138\" src=\"/uploads/202610/20261016-oa9ywn.gif\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-t85n8e.png\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.6648148148148149\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093132\" src=\"/uploads/202610/20261016-t85n8e.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-7jd8j7.gif\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.5633802816901409\" data-type=\"gif\" data-w=\"568\" data-imgfileid=\"503093139\" src=\"/uploads/202610/20261016-7jd8j7.gif\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-9wdfgu.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"1.5657407407407407\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503093133\" src=\"/uploads/202610/20261016-9wdfgu.jpg\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-mmqhvy.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.049074074074074\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093163\" src=\"/uploads/202610/20261016-mmqhvy.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-evvw8c.png\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.9944444444444445\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093135\" src=\"/uploads/202610/20261016-evvw8c.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section><span leaf=\"\"><br /></span></section><section><span leaf=\"\"><br /></span></section><section><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\"><span leaf=\"\"><br /></span></section><section><span leaf=\"\">&nbsp;&nbsp;</span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\" data-pm-slice=\"2 7 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section><span leaf=\"\"><br /></span></section><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"2 5 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"2 2 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\" nodeleaf=\"\"><br /></section></section></section></section></section></section></section></section></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "215": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克电气旗下三大品牌产品荣膺AWE2026艾普兰创新奖",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-dqfdxs.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115550275,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-info\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\">在小说阅读器中沉浸阅读</div></div></div></div><div class=\"arrow-jump-icon\"></div></div><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-clk2w3.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"2.261111111111111\" data-type=\"png\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503093113\" src=\"/uploads/202610/20261016-clk2w3.jpg\" /></section><section style=\"text-align:center;\"><br /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-g8af4h.png\" class=\"rich_pages wxw-img\" data-ratio=\"3.2055555555555557\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503093118\" src=\"/uploads/202610/20261016-g8af4h.png\" style=\"height:auto;\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503093119\" data-ratio=\"0.9361111111111111\" data-src=\"/uploads/202610/20261016-i2xsmm.png\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-i2xsmm.png\" /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section><span leaf=\"\"><br /></span></section><section><span leaf=\"\"><br /></span></section><section><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\"><span leaf=\"\"><br /></span></section><section><span leaf=\"\">&nbsp;&nbsp;</span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\" data-pm-slice=\"2 7 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section><span leaf=\"\"><br /></span></section><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"2 5 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"2 2 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\" nodeleaf=\"\"><br /></section></section></section></section></section></section></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section><span leaf=\"\">&nbsp;</span></section></section></section></section></section><p style=\"display:none;\"></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div></div><div></div><div class=\"rich_media_tool_area\"><div class=\"rich_media_tool__wrp\"></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div></div><div class=\"wx_stream_article_slide_tip\"><div class=\"wx_stream_article_slide_tip_wrp\"><span></span><span>继续滑动看下一个</span></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "216": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "权威认证加冕！莱克电气荣获“三合一洗地吸尘器开创者”认证，新品类定义清洁新标准",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-yf92l4.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115569842,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-info\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\">在小说阅读器中沉浸阅读</div></div></div></div><div class=\"arrow-jump-icon\"></div></div><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-fzm9as.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.862962962962963\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:586px;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092819\" src=\"/uploads/202610/20261016-fzm9as.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-twgaws.png\" class=\"rich_pages wxw-img\" data-ratio=\"4.739814814814815\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092806\" src=\"/uploads/202610/20261016-twgaws.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><img data-src=\"/uploads/202610/20261016-j3ss7b.png\" class=\"rich_pages wxw-img\" data-ratio=\"6.838888888888889\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092821\" src=\"/uploads/202610/20261016-j3ss7b.png\" /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><img data-src=\"/uploads/202610/20261016-gpacjq.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.8064814814814816\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092834\" src=\"/uploads/202610/20261016-gpacjq.png\" /></span></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-yfqyzb.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.7583333333333333\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503092822\" src=\"/uploads/202610/20261016-yfqyzb.png\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-0o3pc5.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.837037037037037\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503092824\" src=\"/uploads/202610/20261016-0o3pc5.png\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-mzytbt.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.6962962962962963\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503092825\" src=\"/uploads/202610/20261016-mzytbt.png\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-3hy01o.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.6962962962962963\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503092811\" src=\"/uploads/202610/20261016-3hy01o.png\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-1thgnx.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.327777777777778\" data-type=\"png\" data-w=\"1080\" data-imgfileid=\"503092830\" src=\"/uploads/202610/20261016-1thgnx.png\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><img data-src=\"/uploads/202610/20261016-pnv1d1.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.7342592592592593\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092818\" src=\"/uploads/202610/20261016-pnv1d1.png\" /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-ijc5pl.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.4111111111111111\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092062\" src=\"/uploads/202610/20261016-ijc5pl.jpg\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-37wina.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.07962962962962963\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092064\" src=\"/uploads/202610/20261016-37wina.jpg\" style=\"height:auto;\" /></section><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\" data-pm-slice=\"2 7 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"2 5 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"3 3 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px;box-sizing: border-box;'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px;box-sizing: border-box;','data-pm-slice':'2 7 [\\'para\\',{\\'tagName\\':\\'section\\',\\'attributes\\':{\\'style\\':\\'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);\\'},\\'namespaceURI\\':\\'http://www.w3.org/1999/xhtml\\'}]'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px 0px;box-sizing: border-box;','data-pm-slice':'2 5 [\\'para\\',{\\'tagName\\':\\'section\\',\\'attributes\\':{\\'style\\':\\'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);\\'},\\'namespaceURI\\':\\'http://www.w3.org/1999/xhtml\\'}]'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=zRdiRX6JOb&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-873loy.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092802\" src=\"/uploads/202610/20261016-873loy.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-yvumog.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.05462962962962963\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092467\" src=\"/uploads/202610/20261016-yvumog.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=kSEBOnueLC&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-vjig1c.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092803\" src=\"/uploads/202610/20261016-vjig1c.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-kgdxi6.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.058333333333333334\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092467\" src=\"/uploads/202610/20261016-kgdxi6.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=XbiVyRtjXY&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-aluuez.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092804\" src=\"/uploads/202610/20261016-aluuez.jpg\" style=\"height:auto;\" /></a></section></section></section></section></section></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-h4bw19.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.06666666666666667\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092062\" src=\"/uploads/202610/20261016-h4bw19.jpg\" /></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-pjlmb8.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-pjlmb8.jpg\" /></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><a href=\"https://weibo.com/p/1006062133807570/home?from=page_100606&mod=TAB&is_all=1#place\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-ia0z48.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-ia0z48.jpg\" /></span></a></section></section></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\"><a href=\"https://www.xiaohongshu.com/user/profile/5bf50ad4ffd64f00019d97c6?xhsshare=CopyLink&appuid=56529f05e4b1cf1e3353f939&apptime=1661750203\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-kr95m3.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-kr95m3.jpg\" /></span></a></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-4rvq30.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-4rvq30.jpg\" /></section></section></section></section></section><p style=\"display:none;\"></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div></div><div></div><div class=\"rich_media_tool_area\"><div class=\"rich_media_tool__wrp\"></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div></div><div class=\"wx_stream_article_slide_tip\"><div class=\"wx_stream_article_slide_tip_wrp\"><span></span><span>继续滑动看下一个</span></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "217": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克、碧云泉荣获2025中国家电行业\"好产品\"大奖",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-7cyqfk.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115680337,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-info\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\"> 在小说阅读器中沉浸阅读 </div></div></div></div><div class=\"arrow-jump-icon\"></div></div><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-tpsw1b.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.374074074074074\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:586px;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092726\" src=\"/uploads/202610/20261016-tpsw1b.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503092727\" data-ratio=\"1.1027777777777779\" data-src=\"/uploads/202610/20261016-kht0js.png\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-kht0js.png\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img js_insertlocalimg\" data-imgfileid=\"503092762\" data-src=\"/uploads/202610/20261016-0rxl33.png\" data-type=\"png\" src=\"/uploads/202610/20261016-0rxl33.png\" style=\"height:auto;\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"></section></section></section></div></div></div></div></div></div>\n\n<section style=\"text-align:center;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img js_insertlocalimg\" data-imgfileid=\"503092764\" data-src=\"/uploads/202610/20261016-bcxnaz.png\" data-type=\"png\" src=\"/uploads/202610/20261016-bcxnaz.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img js_insertlocalimg\" data-imgfileid=\"503092765\" data-src=\"/uploads/202610/20261016-ov7w5a.png\" data-type=\"png\" src=\"/uploads/202610/20261016-ov7w5a.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"></section></section>\n\n<section style=\"text-align:center;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img js_insertlocalimg\" data-imgfileid=\"503092767\" data-src=\"/uploads/202610/20261016-d0cbxq.png\" data-type=\"png\" src=\"/uploads/202610/20261016-d0cbxq.png\" style=\"height:auto;\" /></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503092768\" data-ratio=\"1.2046296296296297\" data-src=\"/uploads/202610/20261016-ae38y4.png\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-ae38y4.png\" /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503092062\" data-ratio=\"0.4111111111111111\" data-src=\"/uploads/202610/20261016-3z3nkz.jpg\" data-type=\"jpeg\" data-w=\"1080\" src=\"/uploads/202610/20261016-3z3nkz.jpg\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-hz5yta.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.07962962962962963\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092064\" src=\"/uploads/202610/20261016-hz5yta.jpg\" style=\"height:auto;\" /></section><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\" data-pm-slice=\"2 7 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"2 5 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"3 3 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px;box-sizing: border-box;'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px;box-sizing: border-box;','data-pm-slice':'2 7 [\\'para\\',{\\'tagName\\':\\'section\\',\\'attributes\\':{\\'style\\':\\'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);\\'},\\'namespaceURI\\':\\'http://www.w3.org/1999/xhtml\\'}]'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px 0px;box-sizing: border-box;','data-pm-slice':'2 5 [\\'para\\',{\\'tagName\\':\\'section\\',\\'attributes\\':{\\'style\\':\\'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);\\'},\\'namespaceURI\\':\\'http://www.w3.org/1999/xhtml\\'}]'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=kSEBOnueLC&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-76ol6q.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092720\" src=\"/uploads/202610/20261016-76ol6q.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-gckyla.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.05462962962962963\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092467\" src=\"/uploads/202610/20261016-gckyla.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=XbiVyRtjXY&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-zewm43.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092721\" src=\"/uploads/202610/20261016-zewm43.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-5j6gvm.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.058333333333333334\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092467\" src=\"/uploads/202610/20261016-5j6gvm.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=ZA0h9UukQU&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-celjwq.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092722\" src=\"/uploads/202610/20261016-celjwq.jpg\" style=\"height:auto;\" /></a></section></section></section></section></section></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-o2vb8e.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.06666666666666667\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092062\" src=\"/uploads/202610/20261016-o2vb8e.jpg\" /></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-cpdfrs.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-cpdfrs.jpg\" /></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><a href=\"https://weibo.com/p/1006062133807570/home?from=page_100606&mod=TAB&is_all=1#place\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-j3lvdz.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-j3lvdz.jpg\" /></span></a></section></section></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\"><a href=\"https://www.xiaohongshu.com/user/profile/5bf50ad4ffd64f00019d97c6?xhsshare=CopyLink&appuid=56529f05e4b1cf1e3353f939&apptime=1661750203\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-1ce0p4.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-1ce0p4.jpg\" /></span></a></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-tvusvo.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-tvusvo.jpg\" /></section></section></section></section><p style=\"display:none;\"></p><div class=\"article-tag__error-tips\" style=\"display:none;\"> 预览时标签不可点 </div><div></div><div></div><div class=\"rich_media_tool_area\"><div class=\"rich_media_tool__wrp\"></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"wx_stream_article_slide_tip\"><div class=\"wx_stream_article_slide_tip_wrp\"><span></span><span>继续滑动看下一个</span></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "218": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "苏宁易购深入莱克电气技术探讨共启11-1月战略攻势合作新篇章",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-0o9v8h.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114842629,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-info\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\"> 在小说阅读器中沉浸阅读 </div></div></div></div><div class=\"arrow-jump-icon\"></div></div><div class=\"rich_media_content js_underline_content autoTypeSetting24psection \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\" data-pm-slice=\"0 0 []\"><section style=\"text-align:center;margin:-1px 0px;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503092485\" data-ratio=\"1.6111111111111112\" data-src=\"/uploads/202610/20261016-aw9qwm.png\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-aw9qwm.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-rchpbx.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.7055555555555556\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092481\" src=\"/uploads/202610/20261016-rchpbx.png\" /></section></section><section style=\"margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;overflow-x:auto;box-sizing:border-box;\"><section style=\"width:500%;overflow-x:hidden;max-width:500% !important;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:20%;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-idlwav.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.5648148148148148\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092482\" src=\"/uploads/202610/20261016-idlwav.png\" /></section></section></section><section style=\"display:inline-block;vertical-align:top;width:20%;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-fkiajo.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.5638888888888889\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092483\" src=\"/uploads/202610/20261016-fkiajo.png\" /></section></section></section><section style=\"display:inline-block;vertical-align:top;width:20%;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-z9lhmg.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.5648148148148148\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092484\" src=\"/uploads/202610/20261016-z9lhmg.png\" /></section></section></section><section style=\"display:inline-block;vertical-align:top;width:20%;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-e8z37u.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.5638888888888889\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092487\" src=\"/uploads/202610/20261016-e8z37u.png\" /></section></section></section><section style=\"display:inline-block;vertical-align:top;width:20%;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-nlqz5a.png\" class=\"rich_pages wxw-img\" data-ratio=\"0.5638888888888889\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092488\" src=\"/uploads/202610/20261016-nlqz5a.png\" /></section></section></section></section></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-e9kw8v.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.0583333333333333\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092507\" src=\"/uploads/202610/20261016-e9kw8v.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-o6cahg.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.8074074\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092491\" src=\"/uploads/202610/20261016-o6cahg.png\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-8ucsqj.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.4111111111111111\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092497\" src=\"/uploads/202610/20261016-8ucsqj.jpg\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-o5tnw8.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.07962962962962963\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092499\" src=\"/uploads/202610/20261016-o5tnw8.jpg\" style=\"height:auto;\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=ZA0h9UukQU&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-dz1434.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.42592592592592593\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092500\" src=\"/uploads/202610/20261016-dz1434.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-4snr5x.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.05462962962962963\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092497\" src=\"/uploads/202610/20261016-4snr5x.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=KbDldTNVX4&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-l4unxc.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092501\" src=\"/uploads/202610/20261016-l4unxc.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-1wvdm7.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.05277777777777778\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092497\" src=\"/uploads/202610/20261016-1wvdm7.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=ZIY2oJgWqR&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-tq8l1y.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092502\" src=\"/uploads/202610/20261016-tq8l1y.jpg\" style=\"height:auto;\" /></a></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-mi9p3c.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-type=\"jpeg\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092486\" src=\"/uploads/202610/20261016-mi9p3c.jpg\" /></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><a href=\"https://weibo.com/p/1006062133807570/home?from=page_100606&mod=TAB&is_all=1#place\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-of89yw.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-type=\"jpeg\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092494\" src=\"/uploads/202610/20261016-of89yw.jpg\" /></span></a></section></section></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><a href=\"https://www.xiaohongshu.com/user/profile/5bf50ad4ffd64f00019d97c6?xhsshare=CopyLink&appuid=56529f05e4b1cf1e3353f939&apptime=1661750203\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-bls9yo.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-type=\"jpeg\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092492\" src=\"/uploads/202610/20261016-bls9yo.jpg\" /></span></a></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-vcsflz.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-type=\"jpeg\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092493\" src=\"/uploads/202610/20261016-vcsflz.jpg\" /></section></section></section></section></section><p style=\"display:none;\"></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\"> 预览时标签不可点 </div><div></div><div></div><div class=\"rich_media_tool_area\"><div class=\"rich_media_tool__wrp\"></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div></div><div class=\"wx_stream_article_slide_tip\"><div class=\"wx_stream_article_slide_tip_wrp\"><span></span><span>继续滑动看下一个</span></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "219": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克天狼星S10 Pro、碧云泉小积木G5领跑IFA家电创新赛道",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-p6a88s.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792110817801,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"3552\" src=\"/uploads/202610/20261016-8q9kpl.png\" /><img data-origin-width=\"1080\" data-origin-height=\"3337\" src=\"/uploads/202610/20261016-4131vd.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1322\" src=\"/uploads/202610/20261016-m7haz1.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1862\" src=\"/uploads/202610/20261016-446r4q.png\" /><img data-origin-width=\"1080\" data-origin-height=\"585\" src=\"/uploads/202610/20261016-herjcu.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1280\" src=\"/uploads/202610/20261016-i9rhup.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1695\" src=\"/uploads/202610/20261016-6qpkqr.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2178\" src=\"/uploads/202610/20261016-r7ysj5.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "220": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "书香沁润职场，文化赋能未来“莱克新教育书房“正式授牌",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-lh2cuk.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112283161,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"1022\" src=\"/uploads/202610/20261016-g6pxau.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"2739\" src=\"/uploads/202610/20261016-rlqbuw.png\" /><img data-origin-width=\"1080\" data-origin-height=\"5517\" src=\"/uploads/202610/20261016-cg03n8.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2919\" src=\"/uploads/202610/20261016-w2i69l.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-4aksj2.jpg",
        src: "/uploads/202610/20261016-l2nxvs.mp4"
      }
    ]
  },
  "221": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "2025 莱克 | 碧云泉 | 咖博士新品体验发布会现场回顾",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-0zsu5z.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112767482,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"1444\" src=\"/uploads/202610/20261016-xdv3nt.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2141\" src=\"/uploads/202610/20261016-3ikc0l.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1322\" src=\"/uploads/202610/20261016-4gxdey.png\" /></p>\n<p><img data-origin-width=\"1080\" data-origin-height=\"1712\" src=\"/uploads/202610/20261016-sj0rzh.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"1008\" src=\"/uploads/202610/20261016-dna6nv.png\" /><img data-origin-width=\"568\" data-origin-height=\"314\" src=\"/uploads/202610/20261016-nb3g5k.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1016\" src=\"/uploads/202610/20261016-fg1hc3.png\" /><img data-origin-width=\"580\" data-origin-height=\"320\" src=\"/uploads/202610/20261016-kmhp8t.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1021\" src=\"/uploads/202610/20261016-h2uxv1.png\" /><img data-origin-width=\"568\" data-origin-height=\"314\" src=\"/uploads/202610/20261016-jszmh6.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"614\" src=\"/uploads/202610/20261016-tdwdsh.png\" /><img data-origin-width=\"568\" data-origin-height=\"312\" src=\"/uploads/202610/20261016-3nokxt.gif\" /><img data-origin-width=\"1079\" data-origin-height=\"50\" src=\"/uploads/202610/20261016-6cf2o0.png\" /><br /><img data-origin-width=\"1080\" data-origin-height=\"2593\" src=\"/uploads/202610/20261016-uwnnl5.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"1013\" src=\"/uploads/202610/20261016-6866nd.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"915\" src=\"/uploads/202610/20261016-jtvmsj.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"2151\" src=\"/uploads/202610/20261016-8aapr2.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1038\" src=\"/uploads/202610/20261016-ic1fn2.png\" /></p>\n\n\n\n",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-sahsyg.jpg",
        src: "/uploads/202610/20261016-6hndnt.mp4"
      }
    ]
  },
  "222": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克电气AWE2025大放异彩，多项大奖彰显创新实力",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-68l2pi.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792110889683,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"2818\" src=\"/uploads/202610/20261016-eg0g39.png\" /><img data-origin-width=\"1080\" data-origin-height=\"975\" src=\"/uploads/202610/20261016-1jbcn4.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2777\" src=\"/uploads/202610/20261016-2iobua.png\" /><img data-origin-width=\"1080\" data-origin-height=\"3490\" src=\"/uploads/202610/20261016-jbtwfg.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2110\" src=\"/uploads/202610/20261016-snrvn0.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "223": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "喜讯 | 莱克入选首批中国消费名品，荣获“时代优品”认证",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-68l2pi.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792110907604,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"2763\" src=\"/uploads/202610/20261016-0fvw9s.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2830\" src=\"/uploads/202610/20261016-0yfuwj.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2108\" src=\"/uploads/202610/20261016-apte0l.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2521\" src=\"/uploads/202610/20261016-yavq07.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "224": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "喜讯 | 莱克荣获两项2024年中国家电行业年度“好产品”奖项",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-aik88m.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792110925655,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"2467\" src=\"/uploads/202610/20261016-5doxn9.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"730\" src=\"/uploads/202610/20261016-pzrb3y.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2628\" src=\"/uploads/202610/20261016-rzq5ce.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"885\" src=\"/uploads/202610/20261016-dl4a6l.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2666\" src=\"/uploads/202610/20261016-8tftbv.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"883\" src=\"/uploads/202610/20261016-ihbqaq.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"955\" src=\"/uploads/202610/20261016-5if1cq.jpg\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "225": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "喜讯 | 莱克电气再获殊荣，荣登2024年度绿色制造名单",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-rawzvv.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792110945389,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"792\" src=\"/uploads/202610/20261016-i9s4xd.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"1185\" src=\"/uploads/202610/20261016-hi0zp7.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"1177\" src=\"/uploads/202610/20261016-llphvj.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"1940\" src=\"/uploads/202610/20261016-jyp7tq.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"570\" src=\"/uploads/202610/20261016-h18uvu.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"790\" src=\"/uploads/202610/20261016-tohg9k.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2534\" src=\"/uploads/202610/20261016-elmmab.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"532\" src=\"/uploads/202610/20261016-oh60g4.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"809\" src=\"/uploads/202610/20261016-jxary7.jpg\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "226": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "回望2024 见证非凡之旅",
      summary: "",
      tags: "新闻资讯",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-ylcgut.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792110964337,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"1441\" src=\"/uploads/202610/20261016-qc1upo.jpg\" /></p>\n\n\n\n\n\n\n\n\n\n",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "227": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克集团:以公益心筑教育梦，携千年府学共赴未来",
      summary: "",
      tags: "社会责任",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-pf7vpc.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114861931,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"novel-card js_wx_tap_highlight wx_tap_card\" style=\"display:none;\"><div class=\"novel-info\"><div class=\"novel-cover-group\"><div class=\"novel-cover\"></div><div class=\"novel-meta\"><div class=\"novel-title\"></div><div class=\"novel-description\"> 在小说阅读器中沉浸阅读 </div></div></div></div><div class=\"arrow-jump-icon\"></div></div><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-oib2ta.png\" class=\"rich_pages wxw-img\" data-ratio=\"1.7166666666666666\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092659\" src=\"/uploads/202610/20261016-oib2ta.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-1w0imy.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.0657407407407407\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092660\" src=\"/uploads/202610/20261016-1w0imy.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-vy5rgz.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.3694444444444445\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092661\" src=\"/uploads/202610/20261016-vy5rgz.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-grvwfq.png\" class=\"rich_pages wxw-img\" data-ratio=\"3.0527777777777776\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092662\" src=\"/uploads/202610/20261016-grvwfq.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><img data-src=\"/uploads/202610/20261016-gffdvq.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.852777777777778\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503092663\" src=\"/uploads/202610/20261016-gffdvq.png\" /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section><section style=\"text-align:center;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><span leaf=\"\"><br /></span></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-3z3nkz.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.4111111111111111\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092062\" src=\"/uploads/202610/20261016-3z3nkz.jpg\" style=\"height:auto;\" /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-hz5yta.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.07962962962962963\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503092064\" src=\"/uploads/202610/20261016-hz5yta.jpg\" style=\"height:auto;\" /></section><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\" data-pm-slice=\"2 7 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"2 5 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px 0px;box-sizing:border-box;\" data-pm-slice=\"3 3 ['para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px;box-sizing: border-box;'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px;box-sizing: border-box;','data-pm-slice':'2 7 [\\'para\\',{\\'tagName\\':\\'section\\',\\'attributes\\':{\\'style\\':\\'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);\\'},\\'namespaceURI\\':\\'http://www.w3.org/1999/xhtml\\'}]'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'text-align: center;line-height: 0;margin: -1px 0px 0px;box-sizing: border-box;','data-pm-slice':'2 5 [\\'para\\',{\\'tagName\\':\\'section\\',\\'attributes\\':{\\'style\\':\\'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);\\'},\\'namespaceURI\\':\\'http://www.w3.org/1999/xhtml\\'}]'},'namespaceURI':'http://www.w3.org/1999/xhtml'},'para',{'tagName':'section','attributes':{'style':'box-sizing: border-box;font-style: normal;font-weight: 400;text-align: justify;font-size: 16px;color: rgb(62, 62, 62);'},'namespaceURI':'http://www.w3.org/1999/xhtml'}]\"><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=XbiVyRtjXY&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-9igf87.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092575\" src=\"/uploads/202610/20261016-9igf87.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-gckyla.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.05462962962962963\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092467\" src=\"/uploads/202610/20261016-gckyla.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=ZA0h9UukQU&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-apk8he.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092576\" src=\"/uploads/202610/20261016-apk8he.jpg\" style=\"height:auto;\" /></a></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-5j6gvm.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.058333333333333334\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092467\" src=\"/uploads/202610/20261016-5j6gvm.jpg\" /></section><section style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" style=\"\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"packages/shop/shopnote/detail/index?noteAlias=KbDldTNVX4&kdtId=44375018&guestKdtId=44375018\"><img data-src=\"/uploads/202610/20261016-g27wwc.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.42578125\" data-type=\"jpeg\" data-w=\"1280\" data-imgfileid=\"503092577\" src=\"/uploads/202610/20261016-g27wwc.jpg\" style=\"height:auto;\" /></a></section></section></section></section></section></section><section style=\"text-align:center;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-o2vb8e.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.06666666666666667\" data-type=\"jpeg\" data-w=\"1080\" style=\"width:578px;height:auto;\" data-imgfileid=\"503092062\" src=\"/uploads/202610/20261016-o2vb8e.jpg\" /></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-cpdfrs.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-cpdfrs.jpg\" /></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><a href=\"https://weibo.com/p/1006062133807570/home?from=page_100606&mod=TAB&is_all=1#place\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-j3lvdz.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8351851851851851\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-j3lvdz.jpg\" /></span></a></section></section></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 5px 0px 0px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\"><a href=\"https://www.xiaohongshu.com/user/profile/5bf50ad4ffd64f00019d97c6?xhsshare=CopyLink&appuid=56529f05e4b1cf1e3353f939&apptime=1661750203\" target=\"_blank\"><span style=\"width:100%;\"><img data-src=\"/uploads/202610/20261016-1ce0p4.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-1ce0p4.jpg\" /></span></a></section></section></section><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-tvusvo.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"0.8592592592592593\" data-w=\"540\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-tvusvo.jpg\" /></section></section></section></section></section><p style=\"display:none;\"></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\"> 预览时标签不可点 </div><div></div><div></div><div class=\"rich_media_tool_area\"><div class=\"rich_media_tool__wrp\"></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div></div><div class=\"wx_stream_article_slide_tip\"><div class=\"wx_stream_article_slide_tip_wrp\"><span></span><span>继续滑动看下一个</span></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "228": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "行直道正，谊在千秋 | 莱克集团向苏州中学捐赠2000万",
      summary: "",
      tags: "社会责任",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-pqt0qb.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114877341,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"article-tag__list\" style=\"display:none;\"><div class=\"article-tag-card__title\">收录于合集</div><div class=\"article-tags\"></div></div><div class=\"rich_media_content js_underline_content autoTypeSetting24psection \" style=\"visibility:visible;\"><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-2g3elv.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"letter-spacing:0.034em;width:578px;height:auto;\" src=\"/uploads/202610/20261016-xmk3m7.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"letter-spacing:0.034em;width:578px;height:auto;\" src=\"/uploads/202610/20261016-256lly.jpg\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"letter-spacing:0.034em;width:578px;height:auto;\" src=\"/uploads/202610/20261016-l6903f.jpg\" /></p><p style=\"display:none;\"><br /></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div class=\"rich_media_tool_area\"></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "229": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克电气助力上海疫情防控，捐赠410万元健康家电驰援上海方舱",
      summary: "",
      tags: "社会责任",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-47k5k9.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114892815,
    body: {
      html: "<div class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"article-tag__list\" style=\"display:none;\"><div class=\"article-tag-card__title\">收录于话题</div><div class=\"article-tags\"></div></div><div class=\"rich_media_content                                                                     \" style=\"visibility:visible;\"><section><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-6hcctt.jpg\" style=\"text-align:center;letter-spacing:0.034em;width:578px;\" /></section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-lxe9ws.jpg\" /></p><section style=\"line-height:0;box-sizing:border-box;font-size:16px;\"><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;width:578px;height:auto;\" src=\"/uploads/202610/20261016-ownp2o.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section><section style=\"line-height:0;box-sizing:border-box;font-size:16px;\"><section style=\"display:inline-block;width:100%;vertical-align:top;background-position:50% 50%;background-repeat:no-repeat;background-size:cover;background-attachment:scroll;background-image:url(https://img01.yzcdn.cn/upload_files/2022/04/13/85bbb9721e0152ef2a7bd8704997d5b3.jpg);box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;overflow-x:auto;box-sizing:border-box;\"><section style=\"overflow:hidden;width:200%;max-width:200% !important;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;box-sizing:border-box;\"><section style=\"text-align:center;margin-top:10px;margin-bottom:10px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><a target=\"_blank\" href=\"http://mp.weixin.qq.com/s?__biz=MzAwMjUzMjAxOA==&mid=2650559191&idx=2&sn=88dc1034c05be564e975a532c2c264bd&chksm=82c0050ab5b78c1cdce8edd1ea160f6823bae6ef45ce4e9382ba4aa34186afec3a6058b95c23&scene=21#wechat_redirect\"><span style=\"top:auto;left:auto;margin:0px;right:auto;bottom:auto;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;margin:0px;height:auto;\" src=\"/uploads/202610/20261016-yo6gve.png\" /></span></a> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section></section><section style=\"display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;\"><section style=\"text-align:center;margin-top:10px;margin-bottom:10px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><a target=\"_blank\" href=\"http://mp.weixin.qq.com/s?__biz=MzAwMjUzMjAxOA==&mid=2650559191&idx=2&sn=88dc1034c05be564e975a532c2c264bd&chksm=82c0050ab5b78c1cdce8edd1ea160f6823bae6ef45ce4e9382ba4aa34186afec3a6058b95c23&scene=21#wechat_redirect\"><span style=\"top:auto;left:auto;margin:0px;right:auto;bottom:auto;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;margin:0px;height:auto;\" src=\"/uploads/202610/20261016-d69buw.png\" /></span></a> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section></section></section></section></section></section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-5a6jwm.jpg\" /><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-4191lg.jpg\" /><br /></p></section><section style=\"line-height:0;box-sizing:border-box;font-size:16px;\"><section style=\"box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;overflow-x:auto;box-sizing:border-box;\"><section style=\"overflow:hidden;width:200%;max-width:200% !important;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;box-sizing:border-box;\"><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;width:578px;height:auto;\" src=\"/uploads/202610/20261016-b32n13.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section></section></section><section style=\"display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;box-sizing:border-box;\"><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;width:578px;height:auto;\" src=\"/uploads/202610/20261016-stgzmj.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section></section></section></section></section></section><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><br /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section><section style=\"line-height:0;box-sizing:border-box;font-size:16px;\"><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-tcleio.jpg\" /></p><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;width:578px;height:auto;\" src=\"/uploads/202610/20261016-kp1orn.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section><br /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section><section style=\"box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;overflow-x:auto;box-sizing:border-box;\"><section style=\"overflow:hidden;width:200%;max-width:200% !important;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;box-sizing:border-box;\"><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;width:578px;height:auto;\" src=\"/uploads/202610/20261016-c6x0e6.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section></section></section><section style=\"display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;\"><section style=\"display:inline-block;width:100%;vertical-align:top;box-sizing:border-box;\"><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;width:578px;height:auto;\" src=\"/uploads/202610/20261016-4owqvm.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section></section></section></section></section></section><section style=\"text-align:center;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;box-sizing:border-box;width:578px;height:auto;\" src=\"/uploads/202610/20261016-qt7o1b.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</section></section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-zvubeb.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-ti7ayq.jpg\" /><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><section style=\"line-height:0;box-sizing:border-box;font-size:16px;\"><section style=\"box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;\"><p style=\"text-align:center;margin-top:10px;margin-bottom:10px;box-sizing:border-box;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=2xj1eajjazpeezo&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-1jrv5m.png\" /></a>&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;&nbsp;</p></section><section style=\"display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;\"><section style=\"text-align:center;margin-top:10px;margin-bottom:10px;box-sizing:border-box;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=35z8vceuhq7km&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-k3ambr.png\" /></a>&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;&nbsp;<br /></section></section></section><section style=\"box-sizing:border-box;\"><p style=\"white-space:normal;box-sizing:border-box;\"><br /><span style=\"text-align:center;caret-color:rgba(0 , 0 , 0 , 0);\"></span><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"text-align:center;font-size:17px;height:auto;\" src=\"/uploads/202610/20261016-676155.png\" /></p></section></section></section></section><p style=\"white-space:normal;caret-color:rgba(0 , 0 , 0 , 0);outline:0px;max-width:100%;font-size:16px;text-align:center;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><span style=\"color:rgb(136 , 136 , 136);font-size:14px;outline:0px;max-width:100%;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><br /></span></p><p style=\"white-space:normal;caret-color:rgba(0 , 0 , 0 , 0);outline:0px;max-width:100%;font-size:16px;text-align:center;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><br /></p></div><div></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div class=\"appmsg_card_context album_read_card\" style=\"display:none;\"><div class=\"album_read_hd weui-flex\"><div class=\"album_read_source\">收录于话题 \n &nbsp; &nbsp; &nbsp; &nbsp; # \n &nbsp; &nbsp; &nbsp; &nbsp;</div>&nbsp;个 \n &nbsp; &nbsp; &nbsp;</div><div class=\"album_read_bd weui-flex\">上一篇 \n &nbsp; &nbsp; &nbsp; &nbsp;下一篇 \n &nbsp; &nbsp; &nbsp;</div></div><div class=\"rich_media_tool_area\"></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div class=\"wx_follow_container\"></div><div class=\"related_container\"></div><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"> \n &nbsp; &nbsp; &nbsp;<p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>\n",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 420,
        poster: "/uploads/202610/20261016-w2vjd0.jpg",
        src: "/uploads/202610/20261016-33z0nu.mp4"
      }
    ]
  },
  "230": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "一图读懂莱克电气2025年半年报",
      summary: "",
      tags: "财务报告",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-90fkoo.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111047411,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"rich_media_content js_underline_content autoTypeSetting24psection \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\" data-pm-slice=\"0 0 []\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img class=\"rich_pages wxw-img\" data-imgfileid=\"503091811\" data-ratio=\"2.3509259\" data-src=\"/uploads/202610/20261016-f0gjd0.jpg\" data-type=\"jpeg\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-f0gjd0.jpg\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-kfx937.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"1.9212963\" data-type=\"jpeg\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503091810\" src=\"/uploads/202610/20261016-kfx937.jpg\" /></section></section><section style=\"text-align:center;margin:-1px 0px;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-tz70iy.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"2.3777778\" data-type=\"jpeg\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503091807\" src=\"/uploads/202610/20261016-tz70iy.jpg\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-cjxlfc.png\" class=\"rich_pages wxw-img\" data-ratio=\"2.2833333\" data-type=\"png\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503091809\" src=\"/uploads/202610/20261016-cjxlfc.png\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-7xowy0.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"2.4185185\" data-type=\"jpeg\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503091808\" src=\"/uploads/202610/20261016-7xowy0.jpg\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-bqf5i5.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"1.8953704\" data-type=\"jpeg\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503091817\" src=\"/uploads/202610/20261016-bqf5i5.jpg\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-jobc51.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"1.2722222\" data-type=\"jpeg\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503091814\" src=\"/uploads/202610/20261016-jobc51.jpg\" /></section></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\" nodeleaf=\"\"><img data-src=\"/uploads/202610/20261016-vazmyh.jpg\" class=\"rich_pages wxw-img js_insertlocalimg\" data-ratio=\"0.07962962962962963\" data-type=\"jpeg\" data-w=\"1080\" data-imgfileid=\"503091822\" src=\"/uploads/202610/20261016-vazmyh.jpg\" style=\"text-align:justify;\" /><img data-src=\"/uploads/202610/20261016-xtcbyb.jpg\" class=\"rich_pages wxw-img\" data-ratio=\"2.1546296\" data-type=\"jpeg\" data-w=\"1080\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" data-imgfileid=\"503091815\" src=\"/uploads/202610/20261016-xtcbyb.jpg\" /></section><section style=\"text-align:center;\" nodeleaf=\"\"><br /></section><section nodeleaf=\"\"></section><section style=\"text-align:center;\"><br /></section></section><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row;margin:0px;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:middle;width:50%;padding:0px 0px 0px 5px;align-self:center;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin:0px 0%;line-height:0;box-sizing:border-box;\"><br /></section></section></section></section></div></div></div></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "231": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "一图读懂莱克电气2024年年报",
      summary: "",
      tags: "财务报告",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-w3xww5.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111069352,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"1779\" src=\"/uploads/202610/20261016-eje5wz.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2651\" src=\"/uploads/202610/20261016-54s9n9.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2266\" src=\"/uploads/202610/20261016-5lcrlq.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1814\" src=\"/uploads/202610/20261016-1c3oir.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1230\" src=\"/uploads/202610/20261016-sakjgc.png\" /><img data-origin-width=\"1080\" data-origin-height=\"950\" src=\"/uploads/202610/20261016-mdcevb.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1253\" src=\"/uploads/202610/20261016-sc0uis.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1099\" src=\"/uploads/202610/20261016-w6vki3.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2037\" src=\"/uploads/202610/20261016-kr9jou.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1585\" src=\"/uploads/202610/20261016-p12zrd.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1681\" src=\"/uploads/202610/20261016-oi2d1s.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "232": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "一图读懂莱克电气2024年半年报",
      summary: "",
      tags: "财务报告",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-90fkoo.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115705757,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;\"><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-cp97fr.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-uzil7o.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-obem8m.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-p1ecjv.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-slwyf8.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-m02sdp.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-3i36da.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2043\" src=\"/uploads/202610/20261016-zax38k.jpg\" /></p></section><p style=\"display:none;\"><br /></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div></div><div class=\"rich_media_tool_area\"><div class=\"rich_media_tool__wrp\"></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><p>微信扫一扫<br />关注该公众号</p></div></div></div></div><div class=\"wx_stream_article_slide_tip\"><div class=\"wx_stream_article_slide_tip_wrp\"><br /></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "233": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "一图读懂莱克电气2023年年报和2024年一季报",
      summary: "",
      tags: "财务报告",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-mpdhzf.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114925497,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"rich_media_content js_underline_content autoTypeSetting24psection \" style=\"visibility:visible;\"><section><section><span style=\"display:none;line-height:0px;\">‍</span></section><section style=\"margin-bottom:0px;caret-color:rgba(0 , 0 , 0 , 0);font-size:16px;white-space:normal;\"><section style=\"margin-bottom:0px;font-size:16px;white-space:normal;\"><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-zpbi0e.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-gow5mp.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-sm2649.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-au0yp8.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-5g23wr.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-kwop7z.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-jgabvf.jpg\" /></p><section style=\"display:inline-block;vertical-align:top;width:50%;align-self:flex-start;flex:0 0 auto;\"><br /></section><section style=\"margin-bottom:0px;font-size:16px;white-space:normal;\"><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"letter-spacing:0.034em;height:auto;\" src=\"/uploads/202610/20261016-hyv2m3.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-lya5uz.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-zj32we.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-77xp7z.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-vnipi6.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-xx1rgw.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-wjvorh.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-qepfer.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-tlf69n.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-iv4u3h.jpg\" /></p></section></section></section></section><p style=\"display:none;\"><br /></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "234": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "一图读懂莱克电气2023半年报",
      summary: "",
      tags: "财务报告",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-y3jac7.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115729815,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"article-tag__list\" style=\"display:none;\"><div class=\"article-tag-card__title\">收录于合集</div><div class=\"article-tags\"></div></div><div class=\"rich_media_content js_underline_content\n                       defaultNoSetting\n            \" style=\"visibility:visible;\"><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-h68bx7.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-9tgyf9.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-zqfys6.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-3dfwg6.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-ebyean.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"letter-spacing:0.034em;height:auto;\" src=\"/uploads/202610/20261016-prrvia.jpg\" /><br /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-7q0ccp.jpg\" /></p><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-ekpbyc.jpg\" /></p><section style=\"margin-bottom:0px;letter-spacing:0.578px;white-space:normal;line-height:0;font-size:16px;\"><p style=\"letter-spacing:0.578px;text-align:center;\"></p><p style=\"letter-spacing:0.578px;text-align:center;\"></p><section></section></section><br /><section style=\"display:inline-block;vertical-align:top;width:50%;align-self:flex-start;flex:0 0 auto;\"><section style=\"text-align:center;line-height:0;\"><section style=\"vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;\">&nbsp;&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;&nbsp; <br /></section></section></section><section style=\"line-height:0;font-size:16px;\"><section style=\"text-align:left;justify-content:flex-start;display:flex;flex-flow:row nowrap;\"><section style=\"display:inline-block;vertical-align:top;width:50%;align-self:flex-start;flex:0 0 auto;\"><section style=\"text-align:center;line-height:0;\"><section style=\"vertical-align:middle;display:inline-block;line-height:0;width:100%;height:auto;\">&nbsp; &nbsp; &nbsp;&nbsp;&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;&nbsp; <br /></section></section></section><section style=\"display:inline-block;vertical-align:top;width:50%;align-self:flex-start;flex:0 0 auto;\"><section style=\"text-align:center;line-height:0;\"></section></section></section></section><p><br /></p><p style=\"display:none;\"><br /></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div class=\"rich_media_tool_area\"></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"> \n &nbsp; &nbsp; &nbsp;<p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "235": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "一图读懂莱克电气2022年年报和2023年一季报",
      summary: "",
      tags: "财务报告",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-k603zo.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792075149047,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "236": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "冲京东Mall挖到莱克 ，吸尘洗地除螨一步到位",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-908jee.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111661394,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-sjg3sg.webp",
        src: "/uploads/202610/20261016-pfgbmq.mp4"
      }
    ]
  },
  "237": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "上海 AWE 焦点！莱克天狼星，一站式解决家务",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-rgu5bk.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111691774,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-omf0lv.webp",
        src: "/uploads/202610/20261016-xdpkw1.mp4"
      }
    ]
  },
  "238": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "从清洁黑科技到生活美学，这里藏着多少惊喜？",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-l7d0n6.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111724299,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-8gbjgw.webp",
        src: "/uploads/202610/20261016-qzuu6s.mp4"
      }
    ]
  },
  "239": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克品质生活，邂逅山城魅力！",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-4a2820.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111752188,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-t12bmg.webp",
        src: "/uploads/202610/20261016-xosw2m.mp4"
      }
    ]
  },
  "240": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "主持人刘帅亲探潍坊三联家电！沉浸式体验莱克天狼星~",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-3jb1eg.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111781691,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-9u3x1n.webp",
        src: "/uploads/202610/20261016-nld88z.mp4"
      }
    ]
  },
  "241": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "逛利群家里不白来！青岛人专属莱克天狼星实测",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-q9tcvg.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111809064,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-cy359h.webp",
        src: "/uploads/202610/20261016-rk1jq2.mp4"
      }
    ]
  },
  "242": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "天狼星550W大吸力 “卷” 进济宁九龙家电",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-xrfspg.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111838201,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-q2j7lf.webp",
        src: "/uploads/202610/20261016-gbea75.mp4"
      }
    ]
  },
  "243": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "跟着主持人张杰逛北国电器：石家庄的隐藏福利",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-dybs3k.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111867035,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-xsdpmp.webp",
        src: "/uploads/202610/20261016-9vqehs.mp4"
      }
    ]
  },
  "244": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "探同利家电天狼星：包头 “包” 藏清洁礼",
      summary: "",
      tags: "城市探店",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-kz253h.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111897616,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1000,
        poster: "/uploads/202610/20261016-fz0yu6.webp",
        src: "/uploads/202610/20261016-0zy1a3.mp4"
      }
    ]
  },
  "245": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "演员费启鸣晒新家，好夏日配好水",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-f0emne.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111933624,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 750,
        poster: "/uploads/202610/20261016-vgen10.webp",
        src: "/uploads/202610/20261016-ei74iw.mp4"
      }
    ]
  },
  "246": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "杨子姗亲测！模块随心搭解锁冰饮自由",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-7sttg9.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111963370,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-9vaoz9.webp",
        src: "/uploads/202610/20261016-owajy0.mp4"
      }
    ]
  },
  "247": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "李思思的24小时喝水养生秘诀",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-f9lu0i.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792111994891,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-k89krz.webp",
        src: "/uploads/202610/20261016-jbzefq.mp4"
      }
    ]
  },
  "248": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "跟着“顿顿”一起解锁夏日饮水黑科技",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-coga7l.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112024406,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1298,
        poster: "/uploads/202610/20261016-ysiq4a.webp",
        src: "/uploads/202610/20261016-5hyfs9.mp4"
      }
    ]
  },
  "249": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "带三个娃还能精致生活？全靠这台天狼星「一键善后」",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-p0yr2l.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112056110,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-zf7z1f.jpg",
        src: "/uploads/202610/20261016-0gn2w1.mp4"
      }
    ]
  },
  "250": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "科技让爱更纯净，让生活更轻松",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-jd47o7.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112091719,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-3umnd0.webp",
        src: "/uploads/202610/20261016-ht4r2c.mp4"
      }
    ]
  },
  "251": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "于AWE人潮中，邂逅“智能”惊喜",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-eimeem.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112123898,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-fixvmv.webp",
        src: "/uploads/202610/20261016-dn5o54.mp4"
      }
    ]
  },
  "252": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "莱克30周年！感受来自苏州的洁净吧！",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-pq7e4o.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112390230,
    body: {
      html: "<p style=\"text-align:center;\">莱克30周年！感受来自苏州的洁净吧！</p>\n",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-h0ynw0.webp",
        src: "/uploads/202610/20261016-3drqdl.mp4"
      }
    ]
  },
  "253": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "回归生活本真秩序，找寻「净」的新境界",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-du8bf2.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112427808,
    body: {
      html: "<p style=\"text-align:center;\">回归生活本真秩序，找寻「净」的新境界</p>\n",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-ncb5bi.webp",
        src: "/uploads/202610/20261016-s952x0.mp4"
      }
    ]
  },
  "254": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "在百年故居花园体验“江南之净 ”的一天",
      summary: "",
      tags: "精选内容",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-yz9q58.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112462231,
    body: {
      html: "<p style=\"text-align:center;\">在百年故居花园体验“江南之净 ”的一天<br /></p>\n",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 1333,
        poster: "/uploads/202610/20261016-5cgson.webp",
        src: "/uploads/202610/20261016-9bympz.mp4"
      }
    ]
  },
  "255": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "净家致心安",
      summary: "",
      tags: "用户故事",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-lr2m1f.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112802190,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;color:rgb(62 , 62 , 62);\"><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><img data-origin-width=\"1080\" data-origin-height=\"2583\" src=\"/uploads/202610/20261016-fywnl0.png\" /><img data-origin-width=\"1080\" data-origin-height=\"3186\" src=\"/uploads/202610/20261016-l6nvpg.png\" /><img data-origin-width=\"568\" data-origin-height=\"320\" src=\"/uploads/202610/20261016-121gl6.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"3641\" src=\"/uploads/202610/20261016-j7w78y.png\" /><img data-origin-width=\"568\" data-origin-height=\"320\" src=\"/uploads/202610/20261016-m07u97.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1898\" src=\"/uploads/202610/20261016-ijjt3m.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2685\" src=\"/uploads/202610/20261016-wsnsky.png\" /><img data-origin-width=\"568\" data-origin-height=\"320\" src=\"/uploads/202610/20261016-oirot6.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"2856\" src=\"/uploads/202610/20261016-67yef1.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1364\" src=\"/uploads/202610/20261016-yzi7i4.png\" /><img data-origin-width=\"1080\" data-origin-height=\"680\" src=\"/uploads/202610/20261016-ntw0hy.png\" /><img data-origin-width=\"568\" data-origin-height=\"320\" src=\"/uploads/202610/20261016-t9bvgi.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"760\" src=\"/uploads/202610/20261016-pedjcj.png\" /><img data-origin-width=\"1080\" data-origin-height=\"683\" src=\"/uploads/202610/20261016-3ixcxp.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1798\" src=\"/uploads/202610/20261016-vdgm1z.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1791\" src=\"/uploads/202610/20261016-4lw2o1.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1026\" src=\"/uploads/202610/20261016-ibydz1.png\" /><img data-origin-width=\"568\" data-origin-height=\"320\" src=\"/uploads/202610/20261016-2tgmsj.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"605\" src=\"/uploads/202610/20261016-2r7l5o.png\" /></section><section style=\"text-align:center;line-height:0;margin:-1px 0px;box-sizing:border-box;\"><section style=\"text-align:center;\" nodeleaf=\"\"><br /></section></section></section></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div></div><div class=\"wx_stream_article_slide_tip\"><div class=\"wx_stream_article_slide_tip_wrp\"><br /></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "256": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "梦想居所，莱克天王星U7成就洁净之美",
      summary: "",
      tags: "用户故事",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-omoq97.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112836958,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"2979\" src=\"/uploads/202610/20261016-91mz5p.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2439\" src=\"/uploads/202610/20261016-s1j1z2.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2921\" src=\"/uploads/202610/20261016-rqn5ea.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-memkxv.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1356\" src=\"/uploads/202610/20261016-59qtzj.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-qfqg8z.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1432\" src=\"/uploads/202610/20261016-31l2ai.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-hevdvs.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"2541\" src=\"/uploads/202610/20261016-2fm4yv.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2657\" src=\"/uploads/202610/20261016-qii36v.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-czst60.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1520\" src=\"/uploads/202610/20261016-0abdte.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-4n00ms.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1531\" src=\"/uploads/202610/20261016-e03chx.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-7odq34.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"2375\" src=\"/uploads/202610/20261016-vykbye.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2702\" src=\"/uploads/202610/20261016-6hngst.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-d3l6xq.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1520\" src=\"/uploads/202610/20261016-emy48d.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"608\" src=\"/uploads/202610/20261016-5wxy5d.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1531\" src=\"/uploads/202610/20261016-3mi3fi.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-b9ktq1.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1727\" src=\"/uploads/202610/20261016-tpex44.jpg\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "257": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "向不凡而生的家",
      summary: "",
      tags: "用户故事",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-0txyt1.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112497317,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"1371\" src=\"/uploads/202610/20261016-is4bwq.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1051\" src=\"/uploads/202610/20261016-9vgpls.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1531\" src=\"/uploads/202610/20261016-hzdvnd.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"555\" src=\"/uploads/202610/20261016-y5txmz.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2269\" src=\"/uploads/202610/20261016-l25w8y.png\" /><img data-origin-width=\"1080\" data-origin-height=\"636\" src=\"/uploads/202610/20261016-vtlg1x.png\" /><img data-origin-width=\"1080\" data-origin-height=\"608\" src=\"/uploads/202610/20261016-o1y2r1.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"633\" src=\"/uploads/202610/20261016-ntcldy.png\" /><img data-origin-width=\"1080\" data-origin-height=\"882\" src=\"/uploads/202610/20261016-zcgizf.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"2056\" src=\"/uploads/202610/20261016-kb5ypt.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1053\" src=\"/uploads/202610/20261016-oqf1wi.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"2290\" src=\"/uploads/202610/20261016-p1gmsx.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1086\" src=\"/uploads/202610/20261016-5vg0ik.png\" /><img data-origin-width=\"1080\" data-origin-height=\"882\" src=\"/uploads/202610/20261016-x3jh73.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"545\" src=\"/uploads/202610/20261016-b9dagc.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-q8w0j1.jpg",
        src: "/uploads/202610/20261016-c1xwqs.mp4"
      }
    ]
  },
  "258": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "情绪流动收容所",
      summary: "",
      tags: "用户故事",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-hn6etr.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114961312,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"rich_media_inner\"><div class=\"wx_row_immersive_stream_wrap\"><div class=\"wx_row_immersive_stream_mask\"><img data-origin-width=\"1080\" data-origin-height=\"3602\" src=\"/uploads/202610/20261016-kjot99.png\" /></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"2495\" src=\"/uploads/202610/20261016-kb4ss6.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1827\" src=\"/uploads/202610/20261016-oj1nph.png\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-vd5ih3.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"2362\" src=\"/uploads/202610/20261016-fljuhy.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1290\" src=\"/uploads/202610/20261016-opab6j.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"2593\" src=\"/uploads/202610/20261016-ezm1p8.png\" /><img data-origin-width=\"1080\" data-origin-height=\"585\" src=\"/uploads/202610/20261016-orkiq3.png\" /><img data-origin-width=\"720\" data-origin-height=\"405\" src=\"/uploads/202610/20261016-h3u3py.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"773\" src=\"/uploads/202610/20261016-8dwwox.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-mqr2t1.jpg",
        src: "/uploads/202610/20261016-1gogzd.mp4"
      }
    ]
  },
  "259": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "本真归真 洁来洁往",
      summary: "",
      tags: "用户故事",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-lxddto.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792112907781,
    body: {
      html: "<p><img data-origin-width=\"1080\" data-origin-height=\"2504\" src=\"/uploads/202610/20261016-7s2dq7.png\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"1641\" src=\"/uploads/202610/20261016-anvszl.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2033\" src=\"/uploads/202610/20261016-fnsk4m.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1320\" src=\"/uploads/202610/20261016-wd143z.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"2239\" src=\"/uploads/202610/20261016-hgec50.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1538\" src=\"/uploads/202610/20261016-in2cc7.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2154\" src=\"/uploads/202610/20261016-gd4h90.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1592\" src=\"/uploads/202610/20261016-03dj4e.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"520\" src=\"/uploads/202610/20261016-t9cp0a.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1241\" src=\"/uploads/202610/20261016-1qv6zk.jpg\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"744\" src=\"/uploads/202610/20261016-z6s7op.jpg\" /><img data-origin-width=\"720\" data-origin-height=\"520\" src=\"/uploads/202610/20261016-pb1aph.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"537\" src=\"/uploads/202610/20261016-odhapj.jpg\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-q3ngwr.jpg",
        src: "/uploads/202610/20261016-vmivve.mp4"
      }
    ]
  },
  "260": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "挖掘记忆深处的故事",
      summary: "",
      tags: "用户故事",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-fstns7.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114978036,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;\"><section style=\"text-align:center;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img data-origin-width=\"1080\" data-origin-height=\"2237\" src=\"/uploads/202610/20261016-byjnjj.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"1816\" src=\"/uploads/202610/20261016-fcp80j.jpg\" /></section></section><section style=\"text-align:center;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"></section></section></section></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>\n\n\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"219\" src=\"/uploads/202610/20261016-c5hoz9.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"578\" src=\"/uploads/202610/20261016-ck13me.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"602\" src=\"/uploads/202610/20261016-h8701p.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"1945\" src=\"/uploads/202610/20261016-d0ci3g.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"578\" src=\"/uploads/202610/20261016-kpgbzq.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"951\" src=\"/uploads/202610/20261016-3xn5t5.jpg\" /></p>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"1565\" src=\"/uploads/202610/20261016-lo1e7w.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"578\" src=\"/uploads/202610/20261016-ukewz5.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"1835\" src=\"/uploads/202610/20261016-yzmrzj.jpg\" /><img data-origin-width=\"1080\" data-origin-height=\"578\" src=\"/uploads/202610/20261016-4faqas.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"721\" src=\"/uploads/202610/20261016-5ob60b.jpg\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-jk51ny.jpg",
        src: "/uploads/202610/20261016-7mo5kx.mp4"
      }
    ]
  },
  "261": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "“绅士”养成计划",
      summary: "",
      tags: "用户故事",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-2pqaul.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792114994177,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"rich_media_content js_underline_content defaultNoSetting \" style=\"visibility:visible;opacity:1;\"><section style=\"box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;\"><section style=\"text-align:center;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-dfbaye.png\" /></section></section><section style=\"text-align:center;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-072e7z.png\" /></section></section><section style=\"text-align:center;line-height:0;box-sizing:border-box;\"><section style=\"max-width:100%;vertical-align:middle;display:inline-block;line-height:0;box-sizing:border-box;\"><img class=\"rich_pages wxw-img\" style=\"vertical-align:middle;max-width:100%;width:100%;box-sizing:border-box;height:auto;\" src=\"/uploads/202610/20261016-pp7idv.png\" /></section></section></section></div></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><p>微信扫一扫<br />关注该公众</p></div></div></div></div></div>\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"2048\" src=\"/uploads/202610/20261016-c0eyun.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1665\" src=\"/uploads/202610/20261016-uanp35.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2767\" src=\"/uploads/202610/20261016-s6kyi2.png\" /><img data-origin-width=\"1080\" data-origin-height=\"2262\" src=\"/uploads/202610/20261016-ouv86u.png\" /><img data-origin-width=\"1080\" data-origin-height=\"1043\" src=\"/uploads/202610/20261016-yy1477.png\" /><img data-origin-width=\"540\" data-origin-height=\"375\" src=\"/uploads/202610/20261016-2x7q2f.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"626\" src=\"/uploads/202610/20261016-dek2wq.png\" /><img data-origin-width=\"1080\" data-origin-height=\"173\" src=\"/uploads/202610/20261016-842j0l.png\" /></p>\n\n\n<p><img data-origin-width=\"1080\" data-origin-height=\"176\" src=\"/uploads/202610/20261016-yqf12h.png\" /><img data-origin-width=\"540\" data-origin-height=\"375\" src=\"/uploads/202610/20261016-40fmm5.gif\" /><img data-origin-width=\"1080\" data-origin-height=\"827\" src=\"/uploads/202610/20261016-5zgtwl.png\" /><img data-origin-width=\"1080\" data-origin-height=\"726\" src=\"/uploads/202610/20261016-1y1y1o.png\" /></p>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-xyaudn.jpg",
        src: "/uploads/202610/20261016-y5ap5s.mp4"
      }
    ]
  },
  "262": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "器之净美 归于心安",
      summary: "",
      tags: "品牌挚友",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-yieb2k.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115753496,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"article-tag__list\" style=\"display:none;\"><div class=\"article-tag-card__title\">收录于合集</div><div class=\"article-tags\"></div></div><div class=\"rich_media_content                                       \" style=\"visibility:visible;\"><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-nunrn0.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-b3x35m.jpg\" /></p><section>&nbsp; &nbsp; &nbsp; &nbsp;</section><section><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"text-align:center;width:578px;height:auto;\" src=\"/uploads/202610/20261016-vvz71a.jpg\" /> \n &nbsp; &nbsp; &nbsp; &nbsp;</section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-kjcbrl.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-1i8rdu.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-d3wijr.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-qt6qf8.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=1y9302dx1irk6&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"height:auto;\" src=\"/uploads/202610/20261016-wy27en.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-b821r7.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=1y9302dx1irk6&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"height:auto;\" src=\"/uploads/202610/20261016-ebpuoq.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-j6qprs.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"height:auto;\" src=\"/uploads/202610/20261016-z1r4e1.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-hsh3m2.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=2fp90b5eqvybqla&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"height:auto;\" src=\"/uploads/202610/20261016-qig8sd.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-oyc8dd.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-p0jpgc.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-85hx24.jpg\" /></p><p style=\"margin:0px;padding:0px;clear:both;min-height:1em;color:rgb(51 , 51 , 51);font-family:mp-quote , -apple-system-font , BlinkMacSystemFont , 'Helvetica Neue' , 'PingFang SC' , 'Hiragino Sans GB' , 'Microsoft YaHei UI' , 'Microsoft YaHei' , Arial , sans-serif;font-style:normal;font-variant-ligatures:normal;font-variant-caps:normal;font-weight:400;letter-spacing:normal;orphans:2;text-indent:0px;text-transform:none;white-space:normal;widows:2;word-spacing:0px;-webkit-text-stroke-width:0px;caret-color:rgba(0 , 0 , 0 , 0);text-decoration-style:initial;text-decoration-color:initial;outline:0px;max-width:100%;font-size:16px;text-align:center;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><br /></p><p style=\"margin:0px;padding:0px;clear:both;min-height:1em;color:rgb(51 , 51 , 51);font-family:mp-quote , -apple-system-font , BlinkMacSystemFont , 'Helvetica Neue' , 'PingFang SC' , 'Hiragino Sans GB' , 'Microsoft YaHei UI' , 'Microsoft YaHei' , Arial , sans-serif;font-style:normal;font-variant-ligatures:normal;font-variant-caps:normal;font-weight:400;letter-spacing:normal;orphans:2;text-indent:0px;text-transform:none;white-space:normal;widows:2;word-spacing:0px;-webkit-text-stroke-width:0px;caret-color:rgba(0 , 0 , 0 , 0);text-decoration-style:initial;text-decoration-color:initial;outline:0px;max-width:100%;font-size:16px;text-align:center;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><br /></p></div><div></div><div></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div class=\"rich_media_tool_area\"></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"> \n &nbsp; &nbsp; &nbsp;<p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "263": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "生活有净气 灵魂有香气",
      summary: "",
      tags: "品牌挚友",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-liqf60.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115027496,
    body: {
      html: "<div><div><div class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner js_rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"article-tag__list\" style=\"display:none;\"><div class=\"article-tag-card__title\">收录于合集</div><div class=\"article-tags\"></div></div><div class=\"rich_media_content                                       \" style=\"visibility:visible;\"><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-j48e80.jpg\" /></p><section>&nbsp; &nbsp; &nbsp; &nbsp;</section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-3sjbpi.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-kj1r3j.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-lkgull.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-s0tk6n.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-x11adz.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p></div></div></div></div></div></div></div></div>\n\n<p><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-ppypfg.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-vealaa.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p>\n\n<p><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-oci7yt.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-yzyy5t.gif\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-guw2pp.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"height:auto;\" src=\"/uploads/202610/20261016-tovgx6.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-dag5gr.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=2fp90b5eqvybqla&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"height:auto;\" src=\"/uploads/202610/20261016-65ypgb.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-xjh6ix.jpg\" /></p><section style=\"line-height:0;box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;font-size:16px;\"><section style=\"justify-content:flex-start;display:flex;flex-flow:row nowrap;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:top;width:50%;align-self:flex-start;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin-top:10px;margin-bottom:10px;box-sizing:border-box;\"><span style=\"letter-spacing:0.034em;\">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;&nbsp;</span><br /></section></section></section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-fcafff.jpg\" /></p></section><p style=\"margin:0px;padding:0px;clear:both;min-height:1em;color:rgb(51 , 51 , 51);font-family:mp-quote , -apple-system-font , BlinkMacSystemFont , 'Helvetica Neue' , 'PingFang SC' , 'Hiragino Sans GB' , 'Microsoft YaHei UI' , 'Microsoft YaHei' , Arial , sans-serif;font-style:normal;font-variant-ligatures:normal;font-variant-caps:normal;font-weight:400;letter-spacing:normal;orphans:2;text-indent:0px;text-transform:none;white-space:normal;widows:2;word-spacing:0px;-webkit-text-stroke-width:0px;text-decoration-style:initial;text-decoration-color:initial;caret-color:rgba(0 , 0 , 0 , 0);outline:0px;max-width:100%;font-size:16px;text-align:center;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><span style=\"margin:0px;padding:0px;color:rgb(136 , 136 , 136);font-size:14px;\"></span></p><p style=\"margin:0px;padding:0px;clear:both;min-height:1em;color:rgb(51 , 51 , 51);font-family:mp-quote , -apple-system-font , BlinkMacSystemFont , 'Helvetica Neue' , 'PingFang SC' , 'Hiragino Sans GB' , 'Microsoft YaHei UI' , 'Microsoft YaHei' , Arial , sans-serif;font-style:normal;font-variant-ligatures:normal;font-variant-caps:normal;font-weight:400;letter-spacing:normal;orphans:2;text-indent:0px;text-transform:none;white-space:normal;widows:2;word-spacing:0px;-webkit-text-stroke-width:0px;text-decoration-style:initial;text-decoration-color:initial;caret-color:rgba(0 , 0 , 0 , 0);outline:0px;max-width:100%;font-size:16px;text-align:center;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><br /><br /></p><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><br /> &nbsp; &nbsp; &nbsp;<p>微信扫一扫<br />关注该公众号</p></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "264": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "诗意之宅 造景入室",
      summary: "",
      tags: "品牌挚友",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-zkwsgg.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115044201,
    body: {
      html: "<div style=\"position:relative;\" class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"article-tag__list\" style=\"display:none;\"><div class=\"article-tag-card__title\">收录于合集</div><div class=\"article-tags\"></div></div><div class=\"rich_media_content             autoTypeSetting24psection\n            \" style=\"visibility:visible;\"><p style=\"text-align:center;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"height:auto;\" src=\"/uploads/202610/20261016-an0d0g.jpg\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-y1j8d4.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-pbg3p6.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-x7sb1p.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-9zk0eb.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-6y4uqz.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-mf2iar.jpg\" style=\"height:auto;\" /></p><p style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-551dhj.gif\" style=\"height:auto;\" /></a><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-biknle.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-ocg0lo.jpg\" style=\"height:auto;\" /></p><p style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-gctfzt.gif\" style=\"height:auto;\" /></a><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-wmvvkv.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-n9gfpj.jpg\" style=\"height:auto;\" /></p><p style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-eb2exh.gif\" style=\"height:auto;\" /></a><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-v8rx14.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-ktzj9i.jpg\" style=\"height:auto;\" /></p><p style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-r79y76.gif\" style=\"height:auto;\" /></a><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-msdac6.jpg\" style=\"height:auto;\" /></p><p style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-kkr30r.gif\" style=\"height:auto;\" /></a><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-umvkhs.jpg\" style=\"height:auto;\" /></p><p style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-x63esb.gif\" style=\"height:auto;\" /></a><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-1fyi1c.jpg\" style=\"height:auto;\" /><img class=\"rich_pages wxw-img js_insertlocalimg\" src=\"/uploads/202610/20261016-tsmpht.jpg\" style=\"height:auto;\" /></p><p style=\"text-align:center;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=1y9302dx1irk6&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" src=\"/uploads/202610/20261016-6hxdem.gif\" style=\"height:auto;\" /></a><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"text-align:justify;width:578px;height:auto;\" src=\"/uploads/202610/20261016-w34wxz.jpg\" /></p><section style=\"line-height:0;box-sizing:border-box;font-size:16px;\"><section style=\"justify-content:flex-start;display:flex;flex-flow:row nowrap;box-sizing:border-box;\"><section style=\"display:inline-block;vertical-align:top;width:50%;align-self:flex-start;flex:0 0 auto;box-sizing:border-box;\"><section style=\"text-align:center;margin-top:10px;margin-bottom:10px;box-sizing:border-box;\"><span style=\"letter-spacing:0.034em;\">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;&nbsp;</span></section></section></section></section><p style=\"display:none;\"><br /></p></div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div class=\"rich_media_tool_area\"></div></div></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"> \n &nbsp; &nbsp; &nbsp;<p>微信扫一扫<br />关注该公众号</p></div></div></div></div></div>",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "265": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "寻得隐秘“天堂” 享足自然之乐",
      summary: "",
      tags: "品牌挚友",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-rr1w2i.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792115062255,
    body: {
      html: "<div class=\"rich_media\"><div class=\"top_banner\"></div><div class=\"rich_media_inner\"><div class=\"rich_media_area_primary\" style=\"background-color:rgb(255 , 255 , 255);\"><div class=\"rich_media_area_primary_inner js_rich_media_area_primary_inner\"><div class=\"rich_media_wrp\"><div class=\"article-tag__list\" style=\"display:none;\"><div class=\"article-tag-card__title\">收录于合集</div><div class=\"article-tags\"></div></div><div class=\"rich_media_content                                       \" style=\"visibility:visible;\"><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-hu8t1l.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-9yxf0z.jpg\" /></p><section>&nbsp; &nbsp; &nbsp; &nbsp;</section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-1ks38j.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-r1frt9.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-sirafx.gif\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-l550p9.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-9p4n16.gif\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-v5x0fs.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-gs04pn.gif\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-5onjfc.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-1egm7f.gif\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-kdfwkk.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-6rx70b.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-rbpvmi.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-kt3rpx.gif\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-5h4amj.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><br /></p><p style=\"text-align:center;margin-bottom:0em;\"><a class=\"weapp_image_link js_weapp_entry\" data-miniprogram-appid=\"wx6bc687ff89875e20\" data-miniprogram-path=\"pages/goods/detail/index?alias=271n4i4etzssmex&shopAutoEnter=1\"><img class=\"rich_pages wxw-img\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-ez4675.gif\" /></a></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-q8fhkn.jpg\" /></p><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-vat8qu.jpg\" /></p><section class=\"channels_iframe_wrp\"></section><p style=\"text-align:center;margin-bottom:0em;\"><img class=\"rich_pages wxw-img js_insertlocalimg\" style=\"width:578px;height:auto;\" src=\"/uploads/202610/20261016-mu0qxc.jpg\" /></p></div></div></div></div></div></div>\n\n<p></p><section style=\"margin:0px;padding:0px;\"><section style=\"margin:0px;padding:0px;\"><p style=\"margin:0px;padding:0px;clear:both;min-height:1em;color:rgb(51 , 51 , 51);font-family:mp-quote , -apple-system-font , BlinkMacSystemFont , 'Helvetica Neue' , 'PingFang SC' , 'Hiragino Sans GB' , 'Microsoft YaHei UI' , 'Microsoft YaHei' , Arial , sans-serif;font-style:normal;font-variant-ligatures:normal;font-variant-caps:normal;font-weight:400;letter-spacing:normal;orphans:2;text-indent:0px;text-transform:none;white-space:normal;widows:2;word-spacing:0px;-webkit-text-stroke-width:0px;text-decoration-style:initial;text-decoration-color:initial;caret-color:rgba(0 , 0 , 0 , 0);outline:0px;max-width:100%;font-size:16px;text-align:center;box-sizing:border-box !important;overflow-wrap:break-word !important;\"><br /></p></section></section><div></div><div class=\"article-tag__error-tips\" style=\"display:none;\">预览时标签不可点</div><div class=\"appmsg_card_context album_read_card\" style=\"display:none;\"><div class=\"album_read_hd weui-flex\"><div class=\"album_read_source\">收录于合集 <br /> &nbsp; &nbsp; &nbsp; &nbsp; # <br /> &nbsp; &nbsp; &nbsp; &nbsp;</div>&nbsp;个 <br /> &nbsp; &nbsp; &nbsp;</div><div class=\"album_read_bd weui-flex\">上一篇 <br /> &nbsp; &nbsp; &nbsp; &nbsp;下一篇 <br /> &nbsp; &nbsp; &nbsp;</div></div><div class=\"rich_media_tool_area\"></div><div class=\"rich_media_area_primary sougou\" style=\"display:none;background-color:rgb(255 , 255 , 255);\"></div><div class=\"rich_media_area_extra\"><div class=\"rich_media_area_extra_inner\"><div class=\"wx_follow_container\"></div><div class=\"related_container\"></div><div></div></div></div><div class=\"qr_code_pc_outer\" style=\"display:none;\"><div class=\"qr_code_pc_inner\"><div class=\"qr_code_pc\"><br /> &nbsp; &nbsp; &nbsp;<p>微信扫一扫<br />关注该公众号</p></div></div></div>\n",
      bg: "#ffffff",
      full: "0"
    },
    blocks: [
      {
        type: "video",
        height: 422,
        poster: "/uploads/202610/20261016-y3mumx.jpg",
        src: "/uploads/202610/20261016-tvh80x.mp4"
      }
    ]
  },
  "266": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "品牌期刊 NO.27 · 新年特刊（2025.01）",
      summary: "",
      tags: "品牌期刊",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-fbdpu2.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792075609178,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "267": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "品牌期刊 NO.26 · 秋冬合刊（2024.11）",
      summary: "",
      tags: "品牌期刊",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-rhi52h.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792075627466,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "268": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "品牌期刊 NO.25 · 九月期刊（2024.09）",
      summary: "",
      tags: "品牌期刊",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-n3nxod.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792075646123,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "269": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "品牌期刊 NO.24 · 八月期刊（2024.08）",
      summary: "",
      tags: "品牌期刊",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-eitl82.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792075664916,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "270": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "品牌期刊 NO.23 · 七月期刊（2024.07）",
      summary: "",
      tags: "品牌期刊",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-lgznz2.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792075684036,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  },
  "271": {
    header: {
      templateId: 2,
      showTitle: true,
      showPublishTime: true,
      showBrowseCount: true,
      showThumbsUpCount: true,
      showEnterShop: true,
      showRecommendItems: true,
      title: "品牌期刊 NO.22 · 六月期刊（2024.06）",
      summary: "",
      tags: "品牌期刊",
      coverMode: "single",
      covers: [
        {
          image: "/uploads/202610/20261012-hwco61.jpg"
        }
      ],
      showGoodsCard: false,
      showNoteOnGoods: false
    },
    publishedAt: 1792075703300,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
  }
};

/** ---------------- 页面级设置（装修后台「页面设置」面板，key = 页面 key） ---------------- */
const PAGE_META = {
  home: {
    desc: "有赞首页复刻",
    bg: "#F2EDE7",
    style: "immersive"
  },
  lexy: {
    desc: "7 大系列",
    bg: "#FFFFFF",
    style: "standard"
  },
  news: {
    desc: "了解莱克",
    bg: "#F0F0F0",
    style: "standard"
  },
  product: {
    desc: "全品牌产品库",
    bg: "#FFFFFF",
    style: "standard"
  },
  mine: {
    desc: "个人中心",
    bg: "#FFFFFF",
    style: "standard"
  },
  p149: {
    desc: "",
    bg: "#F5F6F8",
    style: "standard"
  },
  p159: {
    desc: "",
    bg: "#F5F6F8",
    style: "standard"
  },
  p236: {
    desc: "",
    bg: "#F5F6F8",
    style: "standard"
  },
  p288: {
    desc: "了解莱克 · 栏目入口",
    bg: "#F7F8FA",
    style: "standard"
  },
  p295: {
    desc: "关于莱克 · 莱克资讯栏目",
    bg: "#F7F8FA",
    style: "standard"
  },
  p296: {
    desc: "新闻大事 · 莱克资讯栏目",
    bg: "#F7F8FA",
    style: "standard"
  },
  p297: {
    desc: "创业故事 · 莱克资讯栏目",
    bg: "#FFFFFF",
    style: "standard"
  },
  p298: {
    desc: "我们品牌 · 莱克资讯栏目",
    bg: "#F7F8FA",
    style: "standard"
  },
  p299: {
    desc: "用户分享 · 莱克资讯栏目",
    bg: "#F7F8FA",
    style: "standard"
  },
  p300: {
    desc: "业务模式 · 莱克资讯栏目",
    bg: "#F7F8FA",
    style: "standard"
  },
  p301: {
    desc: "售后服务 · 莱克资讯栏目",
    bg: "#F9F9F9",
    style: "standard"
  },
  p302: {
    desc: "加入我们 · 莱克资讯栏目",
    bg: "#F7F8FA",
    style: "standard"
  },
  p481: {
    desc: "有赞首页复刻",
    bg: "#F2EDE7",
    style: "immersive"
  },
  homebak: {
    desc: "新版首页！！",
    bg: "#F5F6F8",
    style: "standard"
  }
};

/** ---------------- 店铺导航（底部 tabBar 外观，装修后台「店铺导航」面板） ---------------- */
const TABBAR = {
  color: "#8A8A8A",
  selectedColor: "#080808",
  background: "#FFFFFF",
  borderColor: "#EEEEEE",
  iconMode: "always",
  items: [
    {
      path: "/pages/index/index",
      text: "首页",
      icon: "/images/tabbar/home.png",
      activeIcon: "/images/tabbar/home-active.png"
    },
    {
      path: "/pages/lexy/lexy",
      text: "莱克",
      icon: "/images/tabbar/lexy.png",
      activeIcon: "/images/tabbar/lexy-active.png"
    },
    {
      path: "/pages/custom/index?key=p288",
      text: "资讯",
      icon: "/images/tabbar/news.png",
      activeIcon: "/images/tabbar/news-active.png"
    },
    {
      path: "/pages/custom/index?key=p236",
      text: "产品",
      icon: "/images/tabbar/product.png",
      activeIcon: "/images/tabbar/product-active.png"
    },
    {
      path: "/pages/mine/mine",
      text: "个人",
      icon: "/images/tabbar/mine.png",
      activeIcon: "/images/tabbar/mine-active.png"
    }
  ]
};

module.exports = {
  SHOP,
  HOME_BLOCKS,
  MINE_BLOCKS,
  LEXY_SERIES,
  NEWS,
  PRODUCT_NAV_LOGO,
  PRODUCT_BRANDS,
  CUSTOM_PAGES,
  SHOPNOTES,
  PAGE_META,
  TABBAR
};
