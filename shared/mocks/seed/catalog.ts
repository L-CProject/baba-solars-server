import type { CatalogItem } from '@/types'

/**
 * Product catalog for billing, taken from the supplier sales orders shared by the client
 * (Shakti Solar Solutions SO 3844 — 3 kW kit, SO 3861 — 5 kW kit, 22-Oct-26).
 * Rates are those documents' rates (excl. GST). GST: kits 5 %, balance-of-system 18 %
 * (this matches the CGST/SGST printed on both orders).
 */
const bos = (id: string, name: string, hsn: string, unit: string, rate: number, description = ''): CatalogItem =>
  ({ id, name, description, hsn, unit, rate, gstRate: 18, category: 'bos' })

export const seedCatalog: CatalogItem[] = [
  { id: 'kit-3-bifacial', name: '3 kW Waaree Bifacial Kit', description: '540 Wp × 6, Waaree inverter, ACDB/DCDB, LA, 3 earthing rods, 3 pit covers, MC4 × 4, chemical bag', hsn: '85414300', unit: 'SET', rate: 98000, gstRate: 5, category: 'kit' },
  { id: 'kit-3-topcon', name: '3 kW Waaree TOPCon Kit', description: '580 Wp × 6, Waaree inverter, ACDB/DCDB, LA, 3 earthing rods, 3 pit covers, MC4 × 4, chemical bag', hsn: '85414300', unit: 'SET', rate: 112000, gstRate: 5, category: 'kit' },
  { id: 'kit-5-bifacial', name: '5 kW Waaree Bifacial Kit', description: '540 Wp bifacial panels, Waaree inverter, ACDB/DCDB, LA, 3 earthing rods, 3 pit covers, MC4 × 4', hsn: '85414300', unit: 'SET', rate: 179000, gstRate: 5, category: 'kit' },
  { id: 'kit-5-topcon', name: '5 kW Waaree TOPCon Kit', description: '580 Wp TOPCon panels, Waaree inverter, ACDB/DCDB, LA, 3 earthing rods, 3 pit covers, MC4 × 4', hsn: '85414300', unit: 'SET', rate: 186000, gstRate: 5, category: 'kit' },
  bos('str-channel', 'Solar structure channel', '73061919', 'KG', 89, '80×40 legs (3/5/14 ft), 41×41 rails'),
  bos('base-plate', 'Base plate 80×40', '73089090', 'PCS', 90),
  bos('ss-bolt', 'SS bolt 10×50', '73181500', 'PCS', 18),
  bos('wedge-anchor', 'Wedge anchor 12×100', '73181500', 'PCS', 15),
  bos('j-hook', 'J hook with nut 40×40', '73182900', 'NOS', 15),
  bos('mid-clamp', 'GI mid clamp set', '73089090', 'SET', 35),
  bos('end-clamp', 'GI end clamp set', '73089090', 'SET', 34),
  bos('la', 'Lightning arrester 14 mm × 1 m', '85354010', 'PCS', 340, 'With base & insulator'),
  bos('earth-rod', 'Earthing rod 14 mm × 1 m', '74071020', 'PCS', 210, 'With 15 kg chemical bag'),
  bos('pit-cover', 'Earthing pit cover', '39021000', 'PCS', 90),
  bos('ac-cable', 'Polycab AC wire 4 sq mm 2C', '85446090', 'MTR', 126),
  bos('dc-cable', 'Polycab DC solar cable 4 sq mm', '85446090', 'MTR', 62),
  bos('earth-wire-al', 'Al earthing wire 16 sq mm', '85446090', 'MTR', 19),
  bos('earth-wire-cu', 'Havells earthing wire 4 sq mm', '85444999', 'MTR', 62),
  { ...bos('mc4', 'MC4 connector', '85369090', 'NOS', 30), gstRate: 5 }, // billed at 5 % on SO 3844
  bos('mcb-dp', 'MCB DP 6–32 A', '85362030', 'PCS', 450),
  bos('mcb-box', 'MCB box 2-way', '85371000', 'PCS', 50),
  bos('meter-board', 'PVC meter board (small)', '85371000', 'PCS', 160),
  bos('elbow', 'Elbow 25 mm', '73079290', 'PCS', 7),
  bos('tee', 'Tee 25 mm', '39174000', 'PCS', 7),
  bos('rigid-pipe', 'Rigid LMS pipe 25 mm', '39172390', 'PCS', 55),
  bos('flex-pipe', 'Flexible pipe 25 mm', '39172390', 'BDL', 250),
  bos('cable-tray', 'Cable tray 45×45', '85389000', 'PCS', 90),
  bos('cable-tie', 'Cable tie 300 mm', '39231040', 'PAC', 90),
  bos('kaju-khila', 'Kaju khila 25 mm', '39259090', 'PAC', 110),
  bos('earth-nut', 'Earthing nut 30 mm with lug', '85369090', 'PCS', 16),
  bos('screw-rawal', 'Screw with rawal grip', '73181900', 'PCS', 5),
  bos('tape', 'Electrical tape', '39191000', 'PCS', 8),
  { id: 'svc-install', name: 'Installation, testing & commissioning', description: '', hsn: '995442', unit: 'kW', rate: 4000, gstRate: 18, category: 'service' },
  { id: 'svc-netmeter', name: 'Net-metering & subsidy liaison', description: 'CSPDCL application, PM Surya Ghar portal', hsn: '998399', unit: 'LOT', rate: 4500, gstRate: 18, category: 'service' },
  { id: 'svc-drone', name: 'Drone solar panel cleaning', description: 'Per visit', hsn: '998533', unit: 'VISIT', rate: 6000, gstRate: 18, category: 'service' },
  { id: 'svc-amc', name: 'Annual maintenance contract', description: '4 visits, inspection & cleaning', hsn: '998719', unit: 'YEAR', rate: 12000, gstRate: 18, category: 'service' },
]
