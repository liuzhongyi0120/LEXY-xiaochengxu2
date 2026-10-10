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

/* 本文件由「店铺装修后台」生成 · 最后发布 2026-10-10 09:18:32（来源：/admin） */

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
  }
};

/** ---------------- 店铺导航（底部 tabBar 外观，装修后台「店铺导航」面板） ---------------- */
const TABBAR = {
  color: "#8A8A8A",
  selectedColor: "#C8102E",
  background: "#FFFFFF",
  borderColor: "#EEEEEE",
  iconMode: "always",
  items: [
    {
      path: "/pages/index/index",
      text: "首页",
      icon: "",
      activeIcon: ""
    },
    {
      path: "/pages/lexy/lexy",
      text: "莱克",
      icon: "",
      activeIcon: ""
    },
    {
      path: "/pages/news/news",
      text: "资讯",
      icon: "",
      activeIcon: ""
    },
    {
      path: "/pages/product/product",
      text: "产品",
      icon: "",
      activeIcon: ""
    },
    {
      path: "/pages/mine/mine",
      text: "我的",
      icon: "",
      activeIcon: ""
    }
  ]
};

module.exports = {
  SHOP,
  HOME_BLOCKS,
  LEXY_SERIES,
  NEWS,
  PRODUCT_NAV_LOGO,
  PRODUCT_BRANDS,
  CUSTOM_PAGES,
  PAGE_META,
  TABBAR
};
