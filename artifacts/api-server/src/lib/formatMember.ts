type MemberRow = {
  sharesBalance: string;
  savingsBalance: string;
  providentBalance: string;
  christmasBalance: string;
  realLoanBalance: string;
  emergencyLoanBalance: string;
  totalLoanBalance: string;
  electronicsDebt: string;
  sElectronicsDebt: string;
  furnitureDebt: string;
  commodityDebt: string;
  ghlFormDebt: string;
  fireFundBalance: string;
  totalStoreDebt: string;
  fuelVentureBalance: string;
  landLoanBalance: string;
  obSharesBalance?: string | null;
  obSavingsBalance?: string | null;
  obProvidentBalance?: string | null;
  obChristmasBalance?: string | null;
  obRealLoanBalance?: string | null;
  obEmergencyLoanBalance?: string | null;
  obTotalLoanBalance?: string | null;
  obElectronicsDebt?: string | null;
  obSElectronicsDebt?: string | null;
  obFurnitureDebt?: string | null;
  obCommodityDebt?: string | null;
  obGhlFormDebt?: string | null;
  obFireFundBalance?: string | null;
  obFuelVentureBalance?: string | null;
  obLandLoanBalance?: string | null;
  obTotalStoreDebt?: string | null;
  [k: string]: any;
};

function parseOb(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function formatMember<T extends MemberRow>(m: T) {
  return {
    ...m,
    sharesBalance: parseFloat(m.sharesBalance),
    savingsBalance: parseFloat(m.savingsBalance),
    providentBalance: parseFloat(m.providentBalance),
    christmasBalance: parseFloat(m.christmasBalance),
    realLoanBalance: parseFloat(m.realLoanBalance),
    emergencyLoanBalance: parseFloat(m.emergencyLoanBalance),
    totalLoanBalance: parseFloat(m.totalLoanBalance),
    electronicsDebt: parseFloat(m.electronicsDebt),
    sElectronicsDebt: parseFloat(m.sElectronicsDebt),
    furnitureDebt: parseFloat(m.furnitureDebt),
    commodityDebt: parseFloat(m.commodityDebt),
    ghlFormDebt: parseFloat(m.ghlFormDebt),
    fireFundBalance: parseFloat(m.fireFundBalance),
    totalStoreDebt: parseFloat(m.totalStoreDebt),
    fuelVentureBalance: parseFloat(m.fuelVentureBalance),
    landLoanBalance: parseFloat(m.landLoanBalance),
    obSharesBalance: parseOb(m.obSharesBalance),
    obSavingsBalance: parseOb(m.obSavingsBalance),
    obProvidentBalance: parseOb(m.obProvidentBalance),
    obChristmasBalance: parseOb(m.obChristmasBalance),
    obRealLoanBalance: parseOb(m.obRealLoanBalance),
    obEmergencyLoanBalance: parseOb(m.obEmergencyLoanBalance),
    obTotalLoanBalance: parseOb(m.obTotalLoanBalance),
    obElectronicsDebt: parseOb(m.obElectronicsDebt),
    obSElectronicsDebt: parseOb(m.obSElectronicsDebt),
    obFurnitureDebt: parseOb(m.obFurnitureDebt),
    obCommodityDebt: parseOb(m.obCommodityDebt),
    obGhlFormDebt: parseOb(m.obGhlFormDebt),
    obFireFundBalance: parseOb(m.obFireFundBalance),
    obFuelVentureBalance: parseOb(m.obFuelVentureBalance),
    obLandLoanBalance: parseOb(m.obLandLoanBalance),
    obTotalStoreDebt: parseOb(m.obTotalStoreDebt),
  };
}
