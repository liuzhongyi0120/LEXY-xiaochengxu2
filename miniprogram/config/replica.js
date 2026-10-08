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

/* 本文件由「店铺装修后台」生成 · 最后发布 2026-10-08 13:42:28（来源：/admin） */

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
        link: ""
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
const PRODUCT_NAV_LOGO = "https://img01.yzcdn.cn/upload_files/2023/05/31/Fh-29typqZvQ3S048FbLTMAlGaX1.png";

const PRODUCT_BRANDS = [
  {
    id: "lexy",
    name: "莱克",
    groups: [
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/01/20/Fn8be9SP17alZYMbeE_Kspu6wyeI.png!large.webp",
        products: [
          {
            id: "lexy-1-1",
            model: "U7",
            image: "https://img01.yzcdn.cn/upload_files/2024/10/23/FmwdANScv22qOUTxw7Q3jGA1EnaU.png!middle.webp"
          },
          {
            id: "lexy-1-2",
            model: "U5",
            image: "https://img01.yzcdn.cn/upload_files/2024/10/23/FmwdANScv22qOUTxw7Q3jGA1EnaU.png!middle.webp"
          },
          {
            id: "lexy-1-3",
            model: "U3",
            image: "https://img01.yzcdn.cn/upload_files/2024/10/23/FmwdANScv22qOUTxw7Q3jGA1EnaU.png!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/01/21/FvUVL-acP0gJpAdNhi2wQpS1aUuq.png!large.webp",
        products: [
          {
            id: "lexy-2-1",
            model: "S9 Max",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/12/FpnR4wiWr7c6rwCtbKQOcJ3iKFlp.png!middle.webp"
          },
          {
            id: "lexy-2-2",
            model: "S7 Max",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/12/Fqt4pNhhLN9jcYlmS8lnB5GQz4XU.png!middle.webp"
          },
          {
            id: "lexy-2-3",
            model: "S7s Max",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/12/FnUCxzuiJEFudWPNwEUWI50P2pJY.png!middle.webp"
          },
          {
            id: "lexy-2-4",
            model: "S6 Plus Max",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/12/FnUCxzuiJEFudWPNwEUWI50P2pJY.png!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/01/20/FlfrCPNuVD_aHhNg-lcyWPN13Njo.png!large.webp",
        products: [
          {
            id: "lexy-3-1",
            model: "N7 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp"
          },
          {
            id: "lexy-3-2",
            model: "N7",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp"
          },
          {
            id: "lexy-3-3",
            model: "N5 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp"
          },
          {
            id: "lexy-3-4",
            model: "N5",
            image: "https://img01.yzcdn.cn/upload_files/2023/05/30/FnOdMW3Ess2C2URoMXJ-JwVuMkhe.jpg!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/01/20/FgTT1sS8S7ve0F0ZF_gYWMx8gThw.png!large.webp",
        products: [
          {
            id: "lexy-4-1",
            model: "M9",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FtkTuoukoSuOUR80HRKnAgnGFe21.jpg!middle.webp"
          },
          {
            id: "lexy-4-2",
            model: "M7",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/24/Fl1eE8P3zPUmYL0YxRUBp2uCEFWc.png!middle.webp"
          },
          {
            id: "lexy-4-3",
            model: "M5",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/Fo8EpPGIS7NUMqWoYMVBUwL6ESD2.jpg!middle.webp"
          },
          {
            id: "lexy-4-4",
            model: "M3",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FopGi0Nac24IUPFSj91UfrQh2eww.jpg!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2023/10/12/Fly0Iqq-6phfjjjVqoPMie-XoELb.jpg!large.webp",
        products: [
          {
            id: "lexy-5-1",
            model: "K9Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/FnlRhVhmau19DCuj4GmJaobKU_cE.png!middle.webp"
          },
          {
            id: "lexy-5-2",
            model: "K8Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fm-cxiBjfRZX1KsmAd9KIjQAOVos.png!middle.webp"
          },
          {
            id: "lexy-5-3",
            model: "K6Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fukc0GQ_e7u7hMRItEPMv0R1IzI5.png!middle.webp"
          },
          {
            id: "lexy-5-4",
            model: "K5Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fljryg1yz5a5CCWaUo9i2k7np-bi.png!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2023/10/12/Fizyr2zbS1sQZ7ek70cjCBlWjNiG.jpg!large.webp",
        products: [
          {
            id: "lexy-6-1",
            model: "F701",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FojMRjEyLfK2bvq_Xs0SB2NdIyxo.jpg!middle.webp"
          },
          {
            id: "lexy-6-2",
            model: "F503",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FpBGxe1IUNELPWyViS4rqmdV9iUE.jpg!middle.webp"
          },
          {
            id: "lexy-6-3",
            model: "F402",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/02/FmqUYSralGqTctMVG0wH7X6O3c2j.png!middle.webp"
          },
          {
            id: "lexy-6-4",
            model: "F305",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FvJdPFKBFGs9g4z90unm1IdyFsh2.jpg!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2023/10/12/FuHV68XwTx--aYU6cJbV9CKifsn4.jpg!large.webp",
        products: [
          {
            id: "lexy-7-1",
            model: "F8",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FjdlbJMsJF-zgEk2f0zy7sOgjJHK.jpg!middle.webp"
          },
          {
            id: "lexy-7-2",
            model: "F6",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FgVnlHGKtX0Y9gesfAAaeUhemmg8.jpg!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2023/11/04/FkrLDYLcBIw756KlGY1lUdxriITk.jpg!large.webp",
        products: [
          {
            id: "lexy-8-1",
            model: "HU801",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fh-AqUmxQO31VRmDNjqnslzkcKz9.png!middle.webp"
          },
          {
            id: "lexy-8-2",
            model: "HU701",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fh898PuKTYwwOEmE6m_Qan2d0__p.png!middle.webp"
          },
          {
            id: "lexy-8-3",
            model: "HU301",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fva-SHmiuHq0BXrOBDX0eyn8RH3R.png!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2023/10/12/Fr2hKXFhQyqgFq2h7wTAidpLVoxl.jpg!large.webp",
        products: [
          {
            id: "lexy-9-1",
            model: "DH650",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/FnnBw93sMhFR4aDDxYI_-juXhqTL.png!middle.webp"
          },
          {
            id: "lexy-9-2",
            model: "DH350",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fg2vaP3wOk-0TSj3HN-4OPZ99ubk.png!middle.webp"
          },
          {
            id: "lexy-9-3",
            model: "DH200",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/Fmjt9H5C1Mpl40uBiTZ2jL5N6wVh.png!middle.webp"
          },
          {
            id: "lexy-9-4",
            model: "DH180",
            image: "https://img01.yzcdn.cn/upload_files/2023/10/13/FtkqbdSYdPcurK28-u_lejPooyIz.png!middle.webp"
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
        products: [
          {
            id: "jimi-1-1",
            model: "M7Ultra",
            image: "https://img01.yzcdn.cn/upload_files/2025/02/11/FkRcNDJuKJIxOSXPsyCd24Rbbe2m.png!middle.webp"
          },
          {
            id: "jimi-1-2",
            model: "M7 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/02/FklZ_76ViIQOyRqecTvbrWMyRhFE.png!middle.webp"
          },
          {
            id: "jimi-1-3",
            model: "B6 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/FqdkUaI0hmZ6m-UhJFeT3CtV3yUq.png!middle.webp"
          },
          {
            id: "jimi-1-4",
            model: "M5",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/02/Fi60unEUKxU9vReKZ7Q4mdxMHaid.png!middle.webp"
          },
          {
            id: "jimi-1-5",
            model: "M4 Pro",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/FrLqROzKp9AP6yoSHlXhLyiX60GU.png!middle.webp"
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
        header: "https://img01.yzcdn.cn/upload_files/2025/01/20/FpWydtngDrTl_tYonzC7MYEIK73b.png!large.webp",
        products: [
          {
            id: "biquan-1-1",
            model: "N7",
            image: "https://img01.yzcdn.cn/upload_files/2024/11/26/Fuj5h4AH-QKZe35zJ7priJlS4Bad.png!middle.webp"
          },
          {
            id: "biquan-1-2",
            model: "RT701",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/02/FpoMcR9Kc_kb8rliUxJ_etCnDRY9.png!middle.webp"
          },
          {
            id: "biquan-1-3",
            model: "N9s",
            image: "https://img01.yzcdn.cn/upload_files/2024/12/20/FiwvJA9VYKmwpeVPUcuUHiWmsGH_.png!middle.webp"
          },
          {
            id: "biquan-1-4",
            model: "T5 系列",
            image: "https://img01.yzcdn.cn/upload_files/2023/09/09/FoHohzTslHGuQsxmSGDfkC-5ErFU.jpg!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/01/20/FlPTGtWuFOzOLFzo7keX8jiCUvV7.png!large.webp",
        products: [
          {
            id: "biquan-2-1",
            model: "R803",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/Fp9zYV7cHr9YOh5DzOcO0NsK1oZA.png!middle.webp"
          },
          {
            id: "biquan-2-2",
            model: "G5小积木",
            image: "https://img01.yzcdn.cn/upload_files/2025/04/25/Fk0wmjaAnbVZqvuAlndAkmxC_3C2.png!middle.webp"
          },
          {
            id: "biquan-2-3",
            model: "R702",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FjWf-30PhfYy-7ELe3Z9pnYrgv1I.jpg!middle.webp"
          },
          {
            id: "biquan-2-4",
            model: "G7",
            image: "https://img01.yzcdn.cn/upload_files/2023/04/27/FoywEzKx8O3FRLewnNwMB4FfXBDJ.jpeg!middle.webp"
          },
          {
            id: "biquan-2-5",
            model: "C5Pro",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/FjAY_AyPJaocaX-c4v_Wmx8xRWhL.png!middle.webp"
          },
          {
            id: "biquan-2-6",
            model: "C5Plus",
            image: "https://img01.yzcdn.cn/upload_files/2025/05/14/Fk4qV94T1OvQmyBNtnB7t5pO0yXc.png!middle.webp"
          },
          {
            id: "biquan-2-7",
            model: "R7威尼斯",
            image: "https://img01.yzcdn.cn/upload_files/2024/01/10/FrwrK1olNWIT4tRft7xTqcPWM4Sc.jpg!middle.webp"
          },
          {
            id: "biquan-2-8",
            model: "RB601",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/Fl74gJe76S3FaGqyi6XqrCgEm2VR.png!middle.webp"
          }
        ]
      },
      {
        header: "https://img01.yzcdn.cn/upload_files/2025/05/21/FphgrZTs7LtA-WxgXTHnT15EyHGo.jpg!large.webp",
        products: [
          {
            id: "biquan-3-1",
            model: "JSC-RL801",
            image: "https://img01.yzcdn.cn/upload_files/2025/05/21/FloS49Lts6XXDfq1Z52JyGBIuQw2.png!middle.webp"
          },
          {
            id: "biquan-3-2",
            model: "JSC-UL301",
            image: "https://img01.yzcdn.cn/upload_files/2025/05/20/FmDm01gQoG9HiR2Fzn6-DXUprtNW.png!middle.webp"
          }
        ]
      }
    ]
  },
  {
    id: "lexiaochu",
    name: "莱小厨",
    groups: [
      {
        header: "https://img01.yzcdn.cn/upload_files/2023/10/18/FjhCKjoUJYoBmPkz_6CaPryyqf0T.jpg!large.webp",
        products: [
          {
            id: "lexiaochu-1-1",
            model: "TC701",
            image: "https://img01.yzcdn.cn/upload_files/2024/03/19/FmDkS1V0NxxGJOk8266ZqYXV3vn6.png!middle.webp"
          },
          {
            id: "lexiaochu-1-2",
            model: "TC602",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/FqDgpEnpJeg682D1mvxkDfUo8bG0.png!middle.webp"
          },
          {
            id: "lexiaochu-1-3",
            model: "TC601",
            image: "https://img01.yzcdn.cn/upload_files/2024/09/03/FthSE5iTgiETWog6xvthG3P7EM4T.png!middle.webp"
          },
          {
            id: "lexiaochu-1-4",
            model: "TF601",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/05/FuTRL6Im469HI6SpHv9TFhEGiyPL.jpg!middle.webp"
          },
          {
            id: "lexiaochu-1-5",
            model: "AF301",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/05/Fu9c4FJU3u-f90lbnFKDEmvezveK.jpg!middle.webp"
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
        products: [
          {
            id: "kaboshi-1-1",
            model: "Grace 200",
            image: "https://img01.yzcdn.cn/upload_files/2025/03/28/FmyWJnn9YEgPQi4tQ5r1BT6Jrl7S.png!middle.webp"
          },
          {
            id: "kaboshi-1-2",
            model: "HOT 300",
            image: "https://img01.yzcdn.cn/upload_files/2025/03/07/FnnQ3yC_1T-pCYXIqZsWqdyyo7xY.png!middle.webp"
          },
          {
            id: "kaboshi-1-3",
            model: "HOT 100",
            image: "https://img01.yzcdn.cn/upload_files/2025/03/07/FpFW0m03x6w69n_tek9KMqNCqVSj.png!middle.webp"
          }
        ]
      }
    ]
  },
  {
    id: "ximandike",
    name: "西曼帝克",
    groups: [
      {
        header: "https://img01.yzcdn.cn/upload_files/2023/10/18/Fr133MCRCfids9fctYStYOOV28Wm.jpg!large.webp",
        products: [
          {
            id: "ximandike-1-1",
            model: "PB802",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/12/FiBSJzhfQW83V39-nM_0CiFlqpC0.jpg!middle.webp"
          },
          {
            id: "ximandike-1-2",
            model: "CF6",
            image: "https://img01.yzcdn.cn/upload_files/2023/12/16/FlTjrmJR5JUJPbtlqfuYXsOrDORh.jpg!middle.webp"
          },
          {
            id: "ximandike-1-3",
            model: "CF7",
            image: "https://img01.yzcdn.cn/upload_files/2023/12/15/FhItu4yN14pLklxi2XHggFF09sGH.jpg!middle.webp"
          },
          {
            id: "ximandike-1-4",
            model: "CF9",
            image: "https://img01.yzcdn.cn/upload_files/2023/12/16/Fi9MNtJuNg8fm73tB0Swczm5Le1a.jpg!middle.webp"
          },
          {
            id: "ximandike-1-5",
            model: "C9",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/06/FoyFpX-uFZ11E2Ht7b0nrZcOyDKD.jpg!middle.webp"
          },
          {
            id: "ximandike-1-6",
            model: "C7",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/05/FlZt1dv52r4gPNb9ZhcqEI3ei3O8.jpg!middle.webp"
          },
          {
            id: "ximandike-1-7",
            model: "C5",
            image: "https://img01.yzcdn.cn/upload_files/2023/06/05/Ft-P4ij4HpBDNMdgq9jaJcaYnb90.jpg!middle.webp"
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
