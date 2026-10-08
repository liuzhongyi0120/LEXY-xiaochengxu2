/**
 * 官方旗舰店 5 个页面复刻素材与数据
 *
 * 素材来源：有赞官方旗舰店线上页面（首页 / 莱克 / 资讯 / 产品 / 个人中心）
 * 抓取时间：2026-10-07，全部为页面真实使用的图片与视频地址。
 *
 * ⚠️ 说明
 * 1. 图片走有赞 CDN（img.yzcdn.cn / img01.yzcdn.cn），<image> 组件加载网络图片
 *    无需配置 downloadFile 合法域名；正式上线建议迁移到自有 CDN/OSS。
 * 2. 视频地址（mps-trans.yzcdn.cn）带签名参数，**有时效性**，过期后需重新
 *    从源页面获取；正式上线应转存到自有视频服务。
 * 3. 商品卡片图内已含官方名称与价格，本文件不做任何二次编造；
 *    接入真实商品库后，把 onTapGoods 的预览逻辑替换为商品详情跳转即可。
 */

/* 本文件由「店铺装修后台」生成 · 最后发布 2026-10-08 13:55:05（来源：/admin） */

/** 店铺信息（首页与我的页共用） */
const SHOP = {
  name: "LEXY莱克官方旗舰店",
  avatar: "https://img.yzcdn.cn/upload_files/2022/06/24/FnmIoAG300wwWTtliJBcLGB1YJar.png",
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
        image: "https://img.yzcdn.cn/upload_files/2026/01/04/Fo69HIsVHfOzMC08PSX7N7uFY8s1.png!large.webp",
        link: "/pages/product/product"
      },
      {
        image: "https://img.yzcdn.cn/upload_files/2026/01/04/Fl6yiLDP_qD77xcIPwrKfpbdgn3l.jpg!large.webp",
        link: ""
      }
    ]
  },
  {
    type: "video",
    height: 420,
    poster: "https://img.yzcdn.cn/upload_files/2026/01/04/FmWuKKYDvg5Wt4aDDF0BzrOtFjJ6.png!large.webp",
    src: "https://mps-trans.yzcdn.cn/trans/multi_trans_hd/Uz-MZEKf6NthE7u5biW2W-qky5Rr46V_KLnKvA_HD.mp4?sign=8145287703d988569d0617decec05386&t=6ac72d78"
  },
  {
    type: "image",
    height: 1342,
    src: "https://img.yzcdn.cn/upload_files/2026/03/23/FpEmv38JlZ6Gs7uqOc3Oc45c8ZyO.png!large.webp"
  },
  {
    type: "image",
    height: 1642,
    src: "https://img.yzcdn.cn/upload_files/2026/01/07/Fs2JC2Rd_zFcdWuYOzLkNR_PKFP8.jpg!large.webp"
  },
  {
    type: "video",
    height: 420,
    poster: "https://img.yzcdn.cn/upload_files/2025/10/24/FuFIgF8CRwJ0Ea6su5y3izD9gGKe.png!large.webp",
    src: "https://mps-trans.yzcdn.cn/trans/multi_trans_hd/M0W-mlTq_dNu2gupiUqkuqLOUxmnvuMr5POv5w_HD.mp4?sign=792ae03ea00a0d71dbb2d277dbdd4f12&t=6ac72d78"
  },
  {
    type: "image",
    height: 756,
    src: "https://img.yzcdn.cn/upload_files/2026/01/04/Fr_tsF2gAxM2M35MG16j34djUjZs.png!large.webp"
  },
  {
    type: "image",
    height: 1326,
    src: "https://img.yzcdn.cn/upload_files/2026/01/07/FhZ_bsHU5p4qvtJlg5a7rprmsHhB.png!large.webp"
  },
  {
    type: "video",
    height: 420,
    poster: "https://mps-trans.yzcdn.cn/trans/multi_trans_hd/XvLEB33Z0lZ-QiYQ2eRMzI899fRo2arKyE_6qg_cover.jpg",
    src: "https://mps-trans.yzcdn.cn/trans/multi_trans_hd/XvLEB33Z0lZ-QiYQ2eRMzI899fRo2arKyE_6qg_HD.mp4?sign=61361b18bbc123202fc7f9ac2df1ec41&t=6ac72d78"
  },
  {
    type: "image",
    height: 652,
    src: "https://img.yzcdn.cn/upload_files/2026/01/04/FhkZ06W7Z8D16Cd0ULEu700z0_kr.png!large.webp"
  },
  {
    type: "image",
    height: 882,
    src: "https://img.yzcdn.cn/upload_files/2026/01/07/Fs-nj3UEvr_44TFpny7zs8_0TZB2.png!large.webp"
  },
  {
    type: "video",
    height: 420,
    poster: "https://mps-trans.yzcdn.cn/trans/multi_trans_hd/J2S8RqWN_Lla-3X3b99IvkTEmX4tvEsMaSCWog_cover.jpg",
    src: "https://mps-trans.yzcdn.cn/trans/multi_trans_hd/J2S8RqWN_Lla-3X3b99IvkTEmX4tvEsMaSCWog_HD.mp4?sign=719d3d802f7a647feb6e2609074f08b2&t=6ac72d78"
  }
];

/** ---------------- 莱克（产品系列） ---------------- */
const LEXY_SERIES = [
  {
    id: "tianlangxing",
    name: "天狼星系列",
    title: "三合一 大吸力",
    subtitle: "洗地机丨除螨机丨吸尘器",
    hero: "https://img01.yzcdn.cn/upload_files/2025/11/03/FhL5SFjTD4twqazFt_Aj6S-f8ROe.jpg!large.webp",
    products: [
      {
        id: "t1",
        image: "https://img.yzcdn.cn/upload_files/2025/10/24/FhbUPVZ2L4pTbP9KiD9YuCBKFKHz.jpg!large.webp"
      },
      {
        id: "t2",
        image: "https://img.yzcdn.cn/upload_files/2024/12/11/FvbNbJK_Azo9evrthrh-DxXzPgBc.png!large.webp"
      },
      {
        id: "t3",
        image: "https://img.yzcdn.cn/upload_files/2024/12/11/FgQ5Vn2d6FVBnzloRyq2_3TTxhbA.png!large.webp"
      }
    ]
  },
  {
    id: "tianwangxing",
    name: "天王星系列",
    title: "三合一 大吸力",
    subtitle: "吸尘器 | 擦地机 | 除螨机",
    hero: "https://img01.yzcdn.cn/upload_files/2024/10/26/Fn0VTWldpDlzZ6yjf_7tU9GYPiAR.png!large.webp",
    products: [
      {
        id: "w1",
        image: "https://img.yzcdn.cn/upload_files/2024/11/27/Fs0mn4BTQOywMmFO2KPJKI5CeEc0.png!large.webp"
      },
      {
        id: "w2",
        image: "https://img.yzcdn.cn/upload_files/2024/11/27/Fkap9MaaJZE6Y1MzDmRMOhLoRf7Q.png!large.webp"
      },
      {
        id: "w3",
        image: "https://img.yzcdn.cn/upload_files/2024/11/27/Fqhat9-D5nWUbl8jXDFingSWaGUp.png!large.webp"
      }
    ]
  },
  {
    id: "haiwangxing",
    name: "海王星系列",
    title: "三合一 大吸力",
    subtitle: "洗地机丨除螨机丨吸尘器",
    hero: "https://img01.yzcdn.cn/upload_files/2023/08/17/FjcLbGZAvlDqt5gFi-4XQ3_ksID8.jpg!large.webp",
    products: [
      {
        id: "h1",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/Fm0qE7-iDMjl1fg69mpeUkcIAfM5.jpg!large.webp"
      },
      {
        id: "h2",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/FksvwngdwWGcuO9Y_CSWEQk1zjFc.jpg!large.webp"
      },
      {
        id: "h3",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/Fi3IHs-mJ5hrC-fmZvXAUOW1sJ54.jpg!large.webp"
      },
      {
        id: "h4",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/FjoB3ke-gqcD7Q4Y1OZS_F0W26Vf.jpg!large.webp"
      }
    ]
  },
  {
    id: "kongjing",
    name: "空净系列",
    title: "大洁净空气量甲醛净化器",
    subtitle: "快速除醛丨入住无忧",
    hero: "https://img01.yzcdn.cn/upload_files/2023/08/17/Ft2Fh97u6ZrsczSIpPs5hJeofEqs.jpg!large.webp",
    products: [
      {
        id: "k1",
        image: "https://img.yzcdn.cn/upload_files/2023/10/24/FoU-EV_UaGilDLUNy0rR-Vk0JHUb.png!large.webp"
      },
      {
        id: "k2",
        image: "https://img.yzcdn.cn/upload_files/2023/10/24/Fns3sJQW1ljyqUmp_9p_eHoVUlWW.png!large.webp"
      },
      {
        id: "k3",
        image: "https://img.yzcdn.cn/upload_files/2023/10/24/Fo7Q_IGaDywnh59ooGySHDk5bTtm.png!large.webp"
      },
      {
        id: "k4",
        image: "https://img.yzcdn.cn/upload_files/2023/10/24/FrqIKTJUTNE4HarMiH0sIR00p87e.png!large.webp"
      }
    ]
  },
  {
    id: "xunhuaneshan",
    name: "循环扇系列",
    title: "智能空气调节扇",
    subtitle: "全屋循环丨静音轻享",
    hero: "https://img01.yzcdn.cn/upload_files/2023/08/17/FqOj2XsFy3dpqEfidl0Tb1pJTNSl.jpg!large.webp",
    products: [
      {
        id: "f1",
        image: "https://img.yzcdn.cn/upload_files/2024/06/06/FkUE7J2fqJAd6bWCwQxlF01ff9Zs.jpg!large.webp"
      },
      {
        id: "f2",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/FtCowr9egFSfsvZ6KXlDzdUTl03e.jpg!large.webp"
      },
      {
        id: "f3",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/FsoaIBmVgmXb33z_FMM9Mvc8O6o0.jpg!large.webp"
      }
    ]
  },
  {
    id: "mojie",
    name: "魔洁系列",
    title: "魔洁丨立式无线吸尘器",
    subtitle: "立式设计 更轻便",
    hero: "https://img01.yzcdn.cn/upload_files/2023/10/09/FmEqqe9Me172CI3n75WfUzos8PBT.jpg!large.webp",
    products: [
      {
        id: "m1",
        image: "https://img.yzcdn.cn/upload_files/2023/10/24/FvdBdDcQcOdP6eoebRbyUb43qaq2.png!large.webp"
      },
      {
        id: "m2",
        image: "https://img.yzcdn.cn/upload_files/2023/10/24/FjzExe9mJ2XDeBqmaoKxAS_Oz2__.png!large.webp"
      },
      {
        id: "m3",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/Fi5mS2KVfiY7J22pQ3WwQyx3PcpI.jpg!large.webp"
      },
      {
        id: "m4",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/FtEU8EwjEfT9_0298l1PMftagrnc.jpg!large.webp"
      }
    ]
  },
  {
    id: "chuifengji",
    name: "吹风机系列",
    title: "水离子涡扇吹风机",
    subtitle: "纳米水离子丨吹发更丝滑",
    hero: "https://img01.yzcdn.cn/upload_files/2023/10/09/FozxJM1YpB7WS1C3l9-aVTUVeezl.jpg!large.webp",
    products: [
      {
        id: "c1",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/FmRo_QgyDOPnMjSDkfOEJI_XWfnY.jpg!large.webp"
      },
      {
        id: "c2",
        image: "https://img.yzcdn.cn/upload_files/2023/08/17/FhPlih9_l-80MAHsZP7AIYz17Run.jpg!large.webp"
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
      image: "https://img01.yzcdn.cn/upload_files/2025/01/17/FqSuZDEO9tXps6i-YyTynZ5WdwrU.png!large.webp"
    },
    {
      id: "n2",
      key: "news",
      label: "新闻大事",
      image: "https://img01.yzcdn.cn/upload_files/2025/01/18/FsHt5BUUESrpu1Dhc-nw-gzKxvue.png!large.webp"
    }
  ],
  small: [
    {
      id: "n3",
      key: "history",
      label: "创业故事",
      image: "https://img01.yzcdn.cn/upload_files/2025/01/16/FvPNYdc7cOq1Z2qOnMJfQZ_6QGvL.png!large.webp"
    },
    {
      id: "n4",
      key: "brands",
      label: "我们品牌",
      image: "https://img01.yzcdn.cn/upload_files/2026/01/06/Fml3p5gzwaZIBu59McvIzciUd9Yd.jpg!large.webp"
    },
    {
      id: "n5",
      key: "share",
      label: "用户分享",
      image: "https://img01.yzcdn.cn/upload_files/2025/01/18/FjRf6fbuGMS-0NtLDLJhvhuLQ-RW.png!large.webp"
    },
    {
      id: "n6",
      key: "business",
      label: "业务模式",
      image: "https://img01.yzcdn.cn/upload_files/2025/01/15/FlEGD1Kzz0DhqQIPBT_9IuG3Mx57.png!large.webp"
    },
    {
      id: "n7",
      key: "service",
      label: "售后服务",
      image: "https://img01.yzcdn.cn/upload_files/2025/01/18/FgXBmhC4vgU2Zzj883y6u5HwpE5r.png!large.webp"
    },
    {
      id: "n8",
      key: "join",
      label: "加入我们",
      image: "https://img01.yzcdn.cn/upload_files/2025/01/18/Fu667fFSbNvtJW0LY75s1VmaLJbN.png!large.webp"
    }
  ]
};

/** ---------------- 产品（左栏品牌导航 + 右侧分组与型号） ---------------- */
const PRODUCT_NAV_LOGO = "https://img01.yzcdn.cn/upload_files/2025/06/07/FqJzOV45r-RW6l48xjsmk95oHEnX.png";

const PRODUCT_BRANDS = [
  {
    id: "lexy",
    name: "莱克",
    groups: [
      {
        header: "https://img01.yzcdn.cn/upload_files/2026/01/26/Fo67RLzF9eQ6DB_5C38ufUycXSJV.jpg!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-1-1",
            model: "S10系列",
            image: "https://img01.yzcdn.cn/upload_files/2025/09/15/Fkd0LlSB743H6c-NfBMQho7ARVd0.png!middle.webp",
            link: "",
            yzId: "35y0chueb2pnaxa"
          },
          {
            id: "lexy-1-2",
            model: "S9 Max",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/12/FpnR4wiWr7c6rwCtbKQOcJ3iKFlp.png!middle.webp",
            link: "",
            yzId: "2oe54t9wriqjqah"
          },
          {
            id: "lexy-1-3",
            model: "S8",
            image: "https://img01.yzcdn.cn/upload_files/2025/09/15/Flq7-V_UQ9S6PJtXtihYZfQ789v0.png!middle.webp",
            link: "",
            yzId: "3npcxabk2u3zaxj"
          },
          {
            id: "lexy-1-4",
            model: "H5",
            image: "https://img01.yzcdn.cn/upload_files/2026/03/31/FjfKOnDS9ccssxtsBluom43LsUXp.png!middle.webp",
            link: "",
            yzId: "1y7tschyv4mcmzv"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2026/01/26/Fsq4JsfZWotl-EYRQ89GJMrTWuPQ.jpg!large.webp",
        link: "",
        yzId: "1yaatujlfrwomum",
        products: [
          {
            id: "lexy-2-1",
            model: "U7",
            image: "https://img01.yzcdn.cn/upload_files/2024/10/23/FmwdANScv22qOUTxw7Q3jGA1EnaU.png!middle.webp",
            link: "",
            yzId: "1yaatujlfrwomum"
          },
          {
            id: "lexy-2-2",
            model: "U5",
            image: "https://img01.yzcdn.cn/upload_files/2024/10/23/FmwdANScv22qOUTxw7Q3jGA1EnaU.png!middle.webp",
            link: "",
            yzId: "1yaatujlfrwomum"
          },
          {
            id: "lexy-2-3",
            model: "U3",
            image: "https://img01.yzcdn.cn/upload_files/2024/10/23/FmwdANScv22qOUTxw7Q3jGA1EnaU.png!middle.webp",
            link: "",
            yzId: "1yaatujlfrwomum"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/07/09/FkdbEMRUfzOa3TE3YZs3K0_em8tQ.png!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-3-1",
            model: "F701",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FojMRjEyLfK2bvq_Xs0SB2NdIyxo.jpg!middle.webp",
            link: "",
            yzId: "3epcncg0n3b0m13"
          },
          {
            id: "lexy-3-2",
            model: "F503",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FpBGxe1IUNELPWyViS4rqmdV9iUE.jpg!middle.webp",
            link: "",
            yzId: "2fxvf26rje8hi1f"
          },
          {
            id: "lexy-3-3",
            model: "F402",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/02/FmqUYSralGqTctMVG0wH7X6O3c2j.png!middle.webp",
            link: "",
            yzId: "2xgl1uupfs9aeqy"
          },
          {
            id: "lexy-3-4",
            model: "F305",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FvJdPFKBFGs9g4z90unm1IdyFsh2.jpg!middle.webp",
            link: "",
            yzId: "3eo4b4f5qiw5yl0"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/07/09/Fv5PeGTPHuihWGklnREISuDqM2E7.png!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-4-1",
            model: "DH650",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/FnnBw93sMhFR4aDDxYI_-juXhqTL.png!middle.webp",
            link: "",
            yzId: "1y7ub3q71cnzq"
          },
          {
            id: "lexy-4-2",
            model: "DH350",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fg2vaP3wOk-0TSj3HN-4OPZ99ubk.png!middle.webp",
            link: "",
            yzId: "2xlilvs4t5n4m"
          },
          {
            id: "lexy-4-3",
            model: "DH200",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fmjt9H5C1Mpl40uBiTZ2jL5N6wVh.png!middle.webp",
            link: "",
            yzId: "3nj7didd0fsee"
          },
          {
            id: "lexy-4-4",
            model: "DH180",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/FtkqbdSYdPcurK28-u_lejPooyIz.png!middle.webp",
            link: "",
            yzId: "3f0f873ufjq3q"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/07/09/FgixT8XIbomzZDt0p6DpT3V0fb86.png!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-5-1",
            model: "K9Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/FnlRhVhmau19DCuj4GmJaobKU_cE.png!middle.webp",
            link: "",
            yzId: "2fp90b5eqvybqla"
          },
          {
            id: "lexy-5-2",
            model: "K8Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fm-cxiBjfRZX1KsmAd9KIjQAOVos.png!middle.webp",
            link: "",
            yzId: "2xj1eajjazpeezo"
          },
          {
            id: "lexy-5-3",
            model: "K6Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fukc0GQ_e7u7hMRItEPMv0R1IzI5.png!middle.webp",
            link: "",
            yzId: "1y6lsfdfxgfzqci"
          },
          {
            id: "lexy-5-4",
            model: "K5Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fljryg1yz5a5CCWaUo9i2k7np-bi.png!middle.webp",
            link: "",
            yzId: "3nrswwqbhdmrqik"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/07/09/FnmjJ8mITBYrylcNulhhPZ8JCfVT.png!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-6-1",
            model: "F8",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FjdlbJMsJF-zgEk2f0zy7sOgjJHK.jpg!middle.webp",
            link: "",
            yzId: "2x96thdtxt1c6"
          },
          {
            id: "lexy-6-2",
            model: "F6",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FgVnlHGKtX0Y9gesfAAaeUhemmg8.jpg!middle.webp",
            link: "",
            yzId: "36ctiksl11k7a40"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2026/01/07/Ftf8D1LuLcdKVXN-bBTLoROOONBE.jpg!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-7-1",
            model: "M9",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FtkTuoukoSuOUR80HRKnAgnGFe21.jpg!middle.webp",
            link: "",
            yzId: "3nvhrwex6ltaegb"
          },
          {
            id: "lexy-7-2",
            model: "M7",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/24/Fl1eE8P3zPUmYL0YxRUBp2uCEFWc.png!middle.webp",
            link: "",
            yzId: "276ki4fm3ko2un5"
          },
          {
            id: "lexy-7-3",
            model: "C80",
            image: "https://img01.yzcdn.cn/upload_files/2026/08/11/Flw2f4bTOm_9aOLFZtwmpirhGBLs.png!middle.webp",
            link: "",
            yzId: "2flkhpukjiyae76"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2026/01/07/FvvRyN8bAKywboD0dfbYyCDfAgUr.jpg!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-8-1",
            model: "N7 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp",
            link: "",
            yzId: "2fmtd0hkillditm"
          },
          {
            id: "lexy-8-2",
            model: "N7",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp",
            link: "",
            yzId: "2g0cmc0u5p7vac9"
          },
          {
            id: "lexy-8-3",
            model: "N5 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp",
            link: "",
            yzId: "3nlmuhxzp61c647"
          },
          {
            id: "lexy-8-4",
            model: "N5",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp",
            link: "",
            yzId: "2oo0r7i1gm77a4l"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/07/09/FpKxayRUWqVFY11kBrmkjsX3rT1f.png!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "lexy-9-1",
            model: "HU801",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fh-AqUmxQO31VRmDNjqnslzkcKz9.png!middle.webp",
            link: "",
            yzId: "3647gdeeixxcmlc"
          },
          {
            id: "lexy-9-2",
            model: "HU701",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fh898PuKTYwwOEmE6m_Qan2d0__p.png!middle.webp",
            link: "",
            yzId: "2xlhe5qd0w12u"
          },
          {
            id: "lexy-9-3",
            model: "HU301",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fva-SHmiuHq0BXrOBDX0eyn8RH3R.png!middle.webp",
            link: "",
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
        header: "https://img01.yzcdn.cn/upload_files/2026/01/26/FvEIXaPftKtlBwEL5aV8kopRbBvY.jpg!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "biquan-1-1",
            model: "RT801",
            image: "https://img01.yzcdn.cn/upload_files/2024/12/20/FiwvJA9VYKmwpeVPUcuUHiWmsGH_.png!middle.webp",
            link: "",
            yzId: "27bi1z8sivotywt"
          },
          {
            id: "biquan-1-2",
            model: "RT702",
            image: "https://img01.yzcdn.cn/upload_files/2025/07/09/FlJeBswRNWd2j7EAGQyZqlZqYle7.jpg!middle.webp",
            link: "",
            yzId: "26xyfxxmbm79iog"
          },
          {
            id: "biquan-1-3",
            model: "T5 系列",
            image: "https://img01.yzcdn.cn/upload_files/2025/09/18/FpBoSUJzf7Hwx63f5fsw7LLP7rhQ.jpg!middle.webp",
            link: "",
            yzId: "3eo67kl483wzabp"
          },
          {
            id: "biquan-1-4",
            model: "T5Max",
            image: "https://img01.yzcdn.cn/upload_files/2025/12/18/FghNaldM1oL1pkUn01jPcPbn85Fh.png!middle.webp",
            link: "",
            yzId: "2orpm779cb2li7t"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2026/01/07/Fk4oNbQTdIYGwWCmO6p7SuDgJ1wP.jpg!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "biquan-2-1",
            model: "R803",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/Fp9zYV7cHr9YOh5DzOcO0NsK1oZA.png!middle.webp",
            link: "",
            yzId: "3ne8fptryrxs6ct"
          },
          {
            id: "biquan-2-2",
            model: "G5",
            image: "https://img01.yzcdn.cn/upload_files/2025/07/09/FmWIa6Ce1PAXEhtEsmKVJllpBapQ.png!middle.webp",
            link: "",
            yzId: "2oqf0o1bwyfxi4e"
          },
          {
            id: "biquan-2-3",
            model: "R702",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FjWf-30PhfYy-7ELe3Z9pnYrgv1I.jpg!middle.webp",
            link: "",
            yzId: "3epd604zka6ue"
          },
          {
            id: "biquan-2-4",
            model: "C5Pro",
            image: "https://img01.yzcdn.cn/upload_files/2025/08/19/Fr2BbQUJEi-0l_C6-TwDZR78vmCy.png!middle.webp",
            link: "",
            yzId: "3ervf5nngwc4mhh"
          },
          {
            id: "biquan-2-5",
            model: "C5Plus",
            image: "https://img01.yzcdn.cn/upload_files/2025/05/14/Fk4qV94T1OvQmyBNtnB7t5pO0yXc.png!middle.webp",
            link: "",
            yzId: "2oqhg6tay37bacx"
          },
          {
            id: "biquan-2-6",
            model: "V6",
            image: "https://img01.yzcdn.cn/upload_files/2026/05/08/FmeQKzMYsEMqIshiWBj2a9dZ9IGn.png!middle.webp",
            link: "",
            yzId: "2xfbui4wmrw46zs"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/05/22/FklpN_ccPF92CAPQpz77X-M2wM8_.png!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "biquan-3-1",
            model: "JSC-RL801",
            image: "https://img01.yzcdn.cn/upload_files/2025/05/21/FloS49Lts6XXDfq1Z52JyGBIuQw2.png!middle.webp",
            link: "",
            yzId: "36csneaizinba9x"
          },
          {
            id: "biquan-3-2",
            model: "JSC-UL301",
            image: "https://img01.yzcdn.cn/upload_files/2025/05/20/FmDm01gQoG9HiR2Fzn6-DXUprtNW.png!middle.webp",
            link: "",
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
        header: "https://img01.yzcdn.cn/upload_files/2023/10/18/Fu1hIeOrlmLLNFEopLoee6dW8DBz.jpg!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "jimi-1-1",
            model: "M7Ultra",
            image: "https://img01.yzcdn.cn/upload_files/2025/02/11/FkRcNDJuKJIxOSXPsyCd24Rbbe2m.png!middle.webp",
            link: "",
            yzId: "275bt36ex22eefz"
          },
          {
            id: "jimi-1-2",
            model: "M7 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/02/FklZ_76ViIQOyRqecTvbrWMyRhFE.png!middle.webp",
            link: "",
            yzId: "26u75fftdaswmz0"
          },
          {
            id: "jimi-1-3",
            model: "B6 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/FqdkUaI0hmZ6m-UhJFeT3CtV3yUq.png!middle.webp",
            link: "",
            yzId: "1y5dshb9ha2tyjc"
          },
          {
            id: "jimi-1-4",
            model: "M5",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/02/Fi60unEUKxU9vReKZ7Q4mdxMHaid.png!middle.webp",
            link: "",
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
        header: "https://img01.yzcdn.cn/upload_files/2025/03/07/FgrlV9S_ju_GIYwKzYPzQIPIrFO3.png!large.webp",
        link: "",
        yzId: "",
        products: [
          {
            id: "kaboshi-1-1",
            model: "Grace 200",
            image: "https://img01.yzcdn.cn/upload_files/2025/03/28/FmyWJnn9YEgPQi4tQ5r1BT6Jrl7S.png!middle.webp",
            link: "",
            yzId: "2xk7o01k7ai2unp"
          },
          {
            id: "kaboshi-1-2",
            model: "H1S",
            image: "https://img01.yzcdn.cn/upload_files/2026/08/28/FoJQki6IQ5g6qvip3qPtvfSKaF-y.png!middle.webp",
            link: "",
            yzId: "2x7xfmk0rsh9ixi"
          },
          {
            id: "kaboshi-1-3",
            model: "HOT 300",
            image: "https://img01.yzcdn.cn/upload_files/2025/05/22/Fj46kBroh4ddNy83IetSSjcD-ToD.png!middle.webp",
            link: "",
            yzId: "2x49ftbv6d5zqni"
          },
          {
            id: "kaboshi-1-4",
            model: "HOT 100",
            image: "https://img01.yzcdn.cn/upload_files/2025/03/07/FpFW0m03x6w69n_tek9KMqNCqVSj.png!middle.webp",
            link: "",
            yzId: "2fvf2qvnoqujqdj"
          }
        ]
      }
    ]
  }
];

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
  }
};

module.exports = {
  SHOP,
  HOME_BLOCKS,
  LEXY_SERIES,
  NEWS,
  PRODUCT_NAV_LOGO,
  PRODUCT_BRANDS,
  PAGE_META
};
