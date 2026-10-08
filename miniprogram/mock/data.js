/**
 * 演示数据（mock 专用）
 *
 * ⚠️ 本文件所有商品名称、价格、库存均为演示数据，仅用于在没有后端的情况下
 *    预览页面效果。接入真实后端后，本文件不再被引用。
 *    替换为真实商品时，请使用官方商品名称、官方主图与真实价格。
 */

/** 图片占位服务，加载失败时由组件降级为色块 */
const IMG = (text, bg, fg) =>
  `https://placehold.co/600x600/${bg}/${fg}/png?text=${encodeURIComponent(text)}`;

/** 一级分类与二级分类 */
const CATEGORIES = [
  {
    id: 'c1',
    name: '清洁电器',
    icon: IMG('清洁', 'FDECEE', 'C8102E'),
    children: [
      { id: 'c101', name: '吸尘器' },
      { id: 'c102', name: '洗地机' },
      { id: 'c103', name: '除螨仪' }
    ]
  },
  {
    id: 'c2',
    name: '健康饮水',
    icon: IMG('饮水', 'EAF3DE', '3B6D11'),
    children: [
      { id: 'c201', name: '净饮机' },
      { id: 'c202', name: '滤芯耗材' }
    ]
  },
  {
    id: 'c3',
    name: '厨房电器',
    icon: IMG('厨房', 'FAEEDA', '854F0B'),
    children: [
      { id: 'c301', name: '咖啡机' },
      { id: 'c302', name: '破壁机' }
    ]
  },
  {
    id: 'c4',
    name: '环境电器',
    icon: IMG('环境', 'E6F1FB', '185FA5'),
    children: [
      { id: 'c401', name: '空气净化器' },
      { id: 'c402', name: '加湿器' }
    ]
  }
];

/** 首页轮播 */
const BANNERS = [
  { id: 'b1', image: IMG('LEXY 莱克', 'C8102E', 'FFFFFF'), link: '/packageGoods/list/list?categoryId=c1' },
  { id: 'b2', image: IMG('碧云泉 净饮机', '1B4C8C', 'FFFFFF'), link: '/packageGoods/list/list?categoryId=c2' },
  { id: 'b3', image: IMG('新品首发', '323233', 'FFFFFF'), link: '/packageGoods/list/list?sort=new' }
];

/**
 * 由规格定义生成 SKU 矩阵（笛卡尔积）
 * 演示数据用；真实环境中 SKU 由后端商品表返回
 */
function buildSkus(prefix, specs, basePrice, stockSeed) {
  let combos = [[]];
  specs.forEach((spec) => {
    const next = [];
    combos.forEach((combo) => {
      spec.values.forEach((val) => {
        next.push(combo.concat(val));
      });
    });
    combos = next;
  });

  return combos.map((combo, index) => {
    const price = basePrice + index * 10000;
    return {
      skuId: `${prefix}-${String(index + 1).padStart(2, '0')}`,
      specs: combo,
      price,
      originalPrice: price + 30000,
      stock: stockSeed + index * 7
    };
  });
}

/** 商品原始定义 */
const RAW_GOODS = [
  {
    id: 'g1001',
    name: '莱克立式吸尘器 · 轻量长续航系列',
    subtitle: '立式收纳 · 大吸力 · 一键倒尘',
    categoryId: 'c101',
    tags: ['新品', '热销'],
    sales: 1286,
    commentCount: 342,
    cover: IMG('立式吸尘器', 'FDECEE', 'C8102E'),
    images: [IMG('立式吸尘器', 'FDECEE', 'C8102E'), IMG('细节图', 'F5F5F5', '969799'), IMG('场景图', 'E6F1FB', '185FA5')],
    basePrice: 249900,
    stockSeed: 42,
    specs: [
      { name: '颜色', values: ['星空灰', '珍珠白'] },
      { name: '版本', values: ['标准版', '旗舰版'] }
    ],
    description: '立式设计随取随用，整机轻量化处理，长续航电池组支持一次充电完成全屋清洁。'
  },
  {
    id: 'g1002',
    name: '莱克无线手持吸尘器 · 大吸力款',
    subtitle: '多刷头配置 · 除螨一体',
    categoryId: 'c101',
    tags: ['热销'],
    sales: 863,
    commentCount: 211,
    cover: IMG('手持吸尘器', 'F1EFE8', '444441'),
    images: [IMG('手持吸尘器', 'F1EFE8', '444441'), IMG('配件图', 'F5F5F5', '969799')],
    basePrice: 159900,
    stockSeed: 65,
    specs: [{ name: '颜色', values: ['曜石黑', '珍珠白', '晨曦金'] }],
    description: '无线手持设计，配备多组刷头，地板、床褥、车内场景一机覆盖。'
  },
  {
    id: 'g1003',
    name: '莱克智能洗地机 · 自清洁滚刷',
    subtitle: '吸拖洗一体 · 边角贴合',
    categoryId: 'c102',
    tags: ['新品'],
    sales: 542,
    commentCount: 128,
    cover: IMG('智能洗地机', 'E6F1FB', '185FA5'),
    images: [IMG('智能洗地机', 'E6F1FB', '185FA5'), IMG('滚刷细节', 'F5F5F5', '969799')],
    basePrice: 329900,
    stockSeed: 28,
    specs: [
      { name: '颜色', values: ['月岩灰', '云朵白'] },
      { name: '版本', values: ['标准版', '智能版'] }
    ],
    description: '吸拖洗一体，滚刷实时自清洁，贴边设计覆盖墙角缝隙。'
  },
  {
    id: 'g1004',
    name: '莱克洗地机 · 轻量家用款',
    subtitle: '轻机身 · 长续航 · 静音',
    categoryId: 'c102',
    tags: [],
    sales: 341,
    commentCount: 76,
    cover: IMG('洗地机', 'EAF3DE', '3B6D11'),
    images: [IMG('洗地机', 'EAF3DE', '3B6D11')],
    basePrice: 219900,
    stockSeed: 51,
    specs: [{ name: '颜色', values: ['云朵白', '月岩灰'] }],
    description: '轻量化机身，单手推拉省力，低噪运行适合日常家庭使用。'
  },
  {
    id: 'g1005',
    name: '莱克除螨仪 · 紫外线杀菌',
    subtitle: '拍打吸尘 · 热风除湿',
    categoryId: 'c103',
    tags: ['热销'],
    sales: 974,
    commentCount: 305,
    cover: IMG('除螨仪', 'FAEEDA', '854F0B'),
    images: [IMG('除螨仪', 'FAEEDA', '854F0B')],
    basePrice: 69900,
    stockSeed: 120,
    specs: [{ name: '颜色', values: ['珍珠白'] }],
    description: '拍打与强吸同步进行，配合紫外线杀菌与热风除湿，床褥清洁更彻底。'
  },
  {
    id: 'g2001',
    name: '碧云泉台式净饮机 · 即热直饮',
    subtitle: '免安装 · 多档温控 · 大容量',
    categoryId: 'c201',
    tags: ['新品', '热销'],
    sales: 1583,
    commentCount: 486,
    cover: IMG('净饮机', 'E6F1FB', '0C447C'),
    images: [IMG('净饮机', 'E6F1FB', '0C447C'), IMG('滤芯仓', 'F5F5F5', '969799')],
    basePrice: 269900,
    stockSeed: 37,
    specs: [
      { name: '颜色', values: ['月光白', '岩板灰'] },
      { name: '容量', values: ['4L', '5L'] }
    ],
    description: '免安装台式设计，插电即用，多档温度调节满足冲奶、泡茶、直饮等场景。'
  },
  {
    id: 'g2002',
    name: '碧云泉净饮机 · 复合滤芯套装',
    subtitle: '原厂耗材 · 定期更换',
    categoryId: 'c202',
    tags: [],
    sales: 2156,
    commentCount: 158,
    cover: IMG('滤芯套装', 'F1EFE8', '5F5E5A'),
    images: [IMG('滤芯套装', 'F1EFE8', '5F5E5A')],
    basePrice: 39900,
    stockSeed: 200,
    specs: [{ name: '规格', values: ['单支装', '三支装'] }],
    description: '原厂复合滤芯，建议按水质情况定期更换，保障出水品质。'
  },
  {
    id: 'g3001',
    name: '咖博士全自动咖啡机 · 家用意式',
    subtitle: '一键研磨 · 自动清洗',
    categoryId: 'c301',
    tags: ['新品'],
    sales: 268,
    commentCount: 64,
    cover: IMG('咖啡机', 'FAEEDA', '633806'),
    images: [IMG('咖啡机', 'FAEEDA', '633806')],
    basePrice: 399900,
    stockSeed: 19,
    specs: [{ name: '颜色', values: ['经典银', '哑光黑'] }],
    description: '一键完成研磨、萃取、奶泡流程，支持自动清洗管路。'
  }
];

/** 补齐 skus 与价格区间 */
const GOODS = RAW_GOODS.map((item) => {
  const skus = buildSkus(item.id, item.specs, item.basePrice, item.stockSeed);
  const prices = skus.map((s) => s.price);
  return Object.assign({}, item, {
    skus,
    price: Math.min.apply(null, prices),
    priceMax: Math.max.apply(null, prices),
    originalPrice: Math.max.apply(null, prices) + 30000,
    stock: skus.reduce((sum, s) => sum + s.stock, 0),
    status: 'on_sale'
  });
});

/** 商品图文详情（演示用富文本片段） */
const DETAIL_BLOCKS = [
  { type: 'text', content: '产品参数与功能说明请以后续接入的官方商品详情为准。' },
  { type: 'image', content: IMG('产品详情长图', 'F5F5F5', '969799') },
  { type: 'text', content: '本页为开发阶段演示内容，接入后端商品中心后由富文本渲染。' }
];

module.exports = {
  IMG,
  CATEGORIES,
  BANNERS,
  GOODS,
  DETAIL_BLOCKS
};
