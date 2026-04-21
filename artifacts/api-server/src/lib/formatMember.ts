type MemberRow = {
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
  totalStoreDebt: string;
  [k: string]: any;
};

export function formatMember<T extends MemberRow>(m: T) {
  return {
    ...m,
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
    totalStoreDebt: parseFloat(m.totalStoreDebt),
  };
}
