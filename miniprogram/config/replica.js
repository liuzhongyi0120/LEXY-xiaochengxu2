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

/* 本文件由「店铺装修后台」生成 · 最后发布 2026-10-15 23:48:58（来源：/admin） */

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
      bg: "#F5F6F8"
    }
  },
  p159: {
    name: "1",
    blocks: [],
    meta: {
      desc: "",
      bg: "#F5F6F8"
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
      bg: "#F5F6F8"
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
      bg: "#F7F8FA"
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
      bg: "#F7F8FA"
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
      bg: "#F7F8FA"
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
      bg: "#FFFFFF"
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
      bg: "#F7F8FA"
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
      bg: "#F7F8FA"
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
      bg: "#F7F8FA"
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
      bg: "#F9F9F9"
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
      bg: "#F7F8FA"
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
    publishedAt: 1792074982936,
    body: {
      html: "",
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
    publishedAt: 1792074987032,
    body: {
      html: "",
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
    publishedAt: 1792074991743,
    body: {
      html: "",
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
    publishedAt: 1792074996231,
    body: {
      html: "",
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
    publishedAt: 1792075000916,
    body: {
      html: "",
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
    publishedAt: 1792075006119,
    body: {
      html: "",
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
    publishedAt: 1792075011366,
    body: {
      html: "",
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
    publishedAt: 1792075016979,
    body: {
      html: "",
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
    publishedAt: 1792075022832,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075028961,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075035349,
    body: {
      html: "",
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
    publishedAt: 1792075042470,
    body: {
      html: "",
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
    publishedAt: 1792075050209,
    body: {
      html: "",
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
    publishedAt: 1792075058063,
    body: {
      html: "",
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
    publishedAt: 1792075065699,
    body: {
      html: "",
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
    publishedAt: 1792075073786,
    body: {
      html: "",
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
    publishedAt: 1792075081903,
    body: {
      html: "",
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
    publishedAt: 1792075090287,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075099051,
    body: {
      html: "",
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
    publishedAt: 1792075108629,
    body: {
      html: "",
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
    publishedAt: 1792075117959,
    body: {
      html: "",
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
    publishedAt: 1792075127975,
    body: {
      html: "",
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
    publishedAt: 1792075138675,
    body: {
      html: "",
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
    publishedAt: 1792075160984,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075173574,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075184493,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075195375,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075206567,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075218599,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075230574,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075242540,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075254629,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075267405,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075280258,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075293667,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075308244,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075323258,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075338713,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075354349,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075370443,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075387117,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075403491,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075420474,
    body: {
      html: "",
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
    publishedAt: 1792075437503,
    body: {
      html: "",
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
    publishedAt: 1792075455388,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075472581,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075488851,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075505267,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075521881,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    publishedAt: 1792075538772,
    body: {
      html: "",
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
    publishedAt: 1792075555836,
    body: {
      html: "",
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
    publishedAt: 1792075573206,
    body: {
      html: "",
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
    publishedAt: 1792075591066,
    body: {
      html: "",
      bg: "#ffffff",
      full: "0"
    },
    blocks: []
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
    desc: "新版首页！！",
    bg: "#F5F6F8"
  },
  lexy: {
    desc: "7 大系列",
    bg: "#FFFFFF"
  },
  news: {
    desc: "了解莱克",
    bg: "#F0F0F0"
  },
  product: {
    desc: "全品牌产品库",
    bg: "#FFFFFF"
  },
  mine: {
    desc: "个人中心",
    bg: "#FFFFFF"
  },
  p149: {
    desc: "",
    bg: "#F5F6F8"
  },
  p159: {
    desc: "",
    bg: "#F5F6F8"
  },
  p236: {
    desc: "",
    bg: "#F5F6F8"
  },
  p288: {
    desc: "了解莱克 · 栏目入口",
    bg: "#F7F8FA"
  },
  p295: {
    desc: "关于莱克 · 莱克资讯栏目",
    bg: "#F7F8FA"
  },
  p296: {
    desc: "新闻大事 · 莱克资讯栏目",
    bg: "#F7F8FA"
  },
  p297: {
    desc: "创业故事 · 莱克资讯栏目",
    bg: "#FFFFFF"
  },
  p298: {
    desc: "我们品牌 · 莱克资讯栏目",
    bg: "#F7F8FA"
  },
  p299: {
    desc: "用户分享 · 莱克资讯栏目",
    bg: "#F7F8FA"
  },
  p300: {
    desc: "业务模式 · 莱克资讯栏目",
    bg: "#F7F8FA"
  },
  p301: {
    desc: "售后服务 · 莱克资讯栏目",
    bg: "#F9F9F9"
  },
  p302: {
    desc: "加入我们 · 莱克资讯栏目",
    bg: "#F7F8FA"
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
