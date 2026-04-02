const REPORT_ACCOUNT_TYPES = {
  asset: "asset",
  liability: "liability",
  equity: "equity",
  revenue: "revenue",
  cogs: "cogs",
  expense: "expense",
  contra_asset: "contra_asset",
  contra_liability: "contra_liability",
  contra_equity: "contra_equity",
  contra_revenue: "contra_revenue",
  contra_expense: "contra_expense"
};

const DEBIT_NORMAL_TYPES = new Set([
  REPORT_ACCOUNT_TYPES.asset,
  REPORT_ACCOUNT_TYPES.cogs,
  REPORT_ACCOUNT_TYPES.expense,
  REPORT_ACCOUNT_TYPES.contra_liability,
  REPORT_ACCOUNT_TYPES.contra_equity,
  REPORT_ACCOUNT_TYPES.contra_revenue
]);

const CREDIT_NORMAL_TYPES = new Set([
  REPORT_ACCOUNT_TYPES.liability,
  REPORT_ACCOUNT_TYPES.equity,
  REPORT_ACCOUNT_TYPES.revenue,
  REPORT_ACCOUNT_TYPES.contra_asset,
  REPORT_ACCOUNT_TYPES.contra_expense
]);

const CASH_FLOW_SECTIONS = {
  operating: "operating",
  investing: "investing",
  financing: "financing",
  internal: "internal"
};

const DEFAULT_CHART_OF_ACCOUNTS = [
  { account: "Caja", account_type: "asset", category_level_1: "Assets", category_level_2: "Cash" },
  { account: "Banco BBVA Operativo", account_type: "asset", category_level_1: "Assets", category_level_2: "Cash" },
  { account: "Banco Reserva Operativa", account_type: "asset", category_level_1: "Assets", category_level_2: "Cash" },
  { account: "Banco Reserva Expansión", account_type: "asset", category_level_1: "Assets", category_level_2: "Cash" },
  { account: "Tarjetas por cobrar", account_type: "asset", category_level_1: "Assets", category_level_2: "Receivables" },
  { account: "Inventario", account_type: "asset", category_level_1: "Assets", category_level_2: "Current Assets" },
  { account: "Inventory", account_type: "asset", category_level_1: "Assets", category_level_2: "Current Assets" },
  { account: "Equipo cafetería", account_type: "asset", category_level_1: "Assets", category_level_2: "Fixed Assets" },
  { account: "Mobiliario", account_type: "asset", category_level_1: "Assets", category_level_2: "Fixed Assets" },
  { account: "Mejoras del local", account_type: "asset", category_level_1: "Assets", category_level_2: "Fixed Assets" },
  { account: "Cuentas por pagar", account_type: "liability", category_level_1: "Liabilities", category_level_2: "Current Liabilities" },
  { account: "Sueldos por pagar", account_type: "liability", category_level_1: "Liabilities", category_level_2: "Current Liabilities" },
  { account: "Propinas por pagar", account_type: "liability", category_level_1: "Liabilities", category_level_2: "Current Liabilities" },
  { account: "Impuestos por pagar", account_type: "liability", category_level_1: "Liabilities", category_level_2: "Current Liabilities" },
  { account: "Capital social", account_type: "equity", category_level_1: "Equity", category_level_2: "Contributed Capital" },
  { account: "Utilidades retenidas", account_type: "equity", category_level_1: "Equity", category_level_2: "Retained Earnings" },
  { account: "Utilidad del ejercicio", account_type: "equity", category_level_1: "Equity", category_level_2: "Current Earnings" },
  { account: "Sales Revenue", account_type: "revenue", category_level_1: "Revenue", category_level_2: "Operating Revenue" },
  { account: "Estimated COGS", account_type: "cogs", category_level_1: "COGS", category_level_2: "Estimated COGS" },
  { account: "Payroll Expense", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Rent Expense", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Utilities Expense", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Marketing Expense", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Software Expense", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Accounting Fees", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Bank Fees", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "VAT on Bank Fees", account_type: "expense", category_level_1: "Expenses", category_level_2: "Taxes and Fees" },
  { account: "Fuel Expense", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Professional Services", account_type: "expense", category_level_1: "Expenses", category_level_2: "Operating Expenses" },
  { account: "Internal Transfer", account_type: "asset", category_level_1: "Transfers", category_level_2: "Internal Transfer" },
  { account: "Loan Payment", account_type: "liability", category_level_1: "Financing", category_level_2: "Debt" },
  { account: "Clearing Account", account_type: "asset", category_level_1: "Transfers", category_level_2: "Clearing" }
];

function normalizeString(value) {
  return String(value || "").trim();
}

function toPeriodMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function buildAccountIndex(chartOfAccounts = []) {
  const index = new Map();
  const entries = chartOfAccounts.length ? chartOfAccounts : DEFAULT_CHART_OF_ACCOUNTS;

  for (const row of entries) {
    const account = normalizeString(row.account);
    if (!account) {
      continue;
    }

    index.set(account, {
      account,
      account_type: normalizeAccountType(row.account_type),
      category_level_1: normalizeString(row.category_level_1),
      category_level_2: normalizeString(row.category_level_2)
    });
  }

  return index;
}

function normalizeAccountType(accountType) {
  const value = normalizeString(accountType).toLowerCase();
  if (DEBIT_NORMAL_TYPES.has(value) || CREDIT_NORMAL_TYPES.has(value)) {
    return value;
  }

  if (value === "assets") return REPORT_ACCOUNT_TYPES.asset;
  if (value === "liabilities") return REPORT_ACCOUNT_TYPES.liability;
  if (value === "equity") return REPORT_ACCOUNT_TYPES.equity;
  if (value === "revenue") return REPORT_ACCOUNT_TYPES.revenue;
  if (value === "expenses") return REPORT_ACCOUNT_TYPES.expense;
  if (value === "expense") return REPORT_ACCOUNT_TYPES.expense;
  if (value === "cogs") return REPORT_ACCOUNT_TYPES.cogs;
  return "";
}

function inferAccountMeta(account, sourceEntry, fallbackType) {
  const categoryLevel1 =
    normalizeString(sourceEntry?.category_level_1) ||
    defaultCategoryLevel1(fallbackType);
  const categoryLevel2 =
    normalizeString(sourceEntry?.category_level_2) ||
    defaultCategoryLevel2(fallbackType);

  return {
    account,
    account_type: fallbackType,
    category_level_1: categoryLevel1,
    category_level_2: categoryLevel2
  };
}

function defaultCategoryLevel1(accountType) {
  switch (accountType) {
    case REPORT_ACCOUNT_TYPES.asset:
      return "Assets";
    case REPORT_ACCOUNT_TYPES.liability:
      return "Liabilities";
    case REPORT_ACCOUNT_TYPES.equity:
      return "Equity";
    case REPORT_ACCOUNT_TYPES.revenue:
      return "Revenue";
    case REPORT_ACCOUNT_TYPES.cogs:
      return "COGS";
    case REPORT_ACCOUNT_TYPES.expense:
      return "Expenses";
    default:
      return "Unclassified";
  }
}

function defaultCategoryLevel2(accountType) {
  switch (accountType) {
    case REPORT_ACCOUNT_TYPES.asset:
      return "Other Assets";
    case REPORT_ACCOUNT_TYPES.liability:
      return "Other Liabilities";
    case REPORT_ACCOUNT_TYPES.equity:
      return "Other Equity";
    case REPORT_ACCOUNT_TYPES.revenue:
      return "Other Revenue";
    case REPORT_ACCOUNT_TYPES.cogs:
      return "Estimated COGS";
    case REPORT_ACCOUNT_TYPES.expense:
      return "Operating Expenses";
    default:
      return "Other";
  }
}

function buildPosting(entry, side, accountIndex) {
  const account = normalizeString(side === "debit" ? entry.debit_account : entry.credit_account);
  if (!account) {
    return null;
  }

  const chartMeta = accountIndex.get(account);
  const fallbackType =
    chartMeta?.account_type ||
    (side === "debit"
      ? normalizeAccountType(entry.account_type) || REPORT_ACCOUNT_TYPES.asset
      : reverseNormalType(normalizeAccountType(entry.account_type)) || REPORT_ACCOUNT_TYPES.liability);

  return {
    period_month: toPeriodMonth(entry.date),
    date: entry.date,
    account,
    side,
    amount: Number(entry.amount || 0),
    description: normalizeString(entry.description),
    bank_code: normalizeString(entry.bank_code),
    reference: normalizeString(entry.reference),
    classification_rule: normalizeString(entry.classification_rule),
    meta: chartMeta || inferAccountMeta(account, entry, fallbackType)
  };
}

function reverseNormalType(accountType) {
  switch (accountType) {
    case REPORT_ACCOUNT_TYPES.asset:
      return REPORT_ACCOUNT_TYPES.liability;
    case REPORT_ACCOUNT_TYPES.expense:
    case REPORT_ACCOUNT_TYPES.cogs:
      return REPORT_ACCOUNT_TYPES.revenue;
    case REPORT_ACCOUNT_TYPES.liability:
      return REPORT_ACCOUNT_TYPES.asset;
    case REPORT_ACCOUNT_TYPES.equity:
      return REPORT_ACCOUNT_TYPES.asset;
    case REPORT_ACCOUNT_TYPES.revenue:
      return REPORT_ACCOUNT_TYPES.asset;
    default:
      return "";
  }
}

function expandJournalEntries(journalEntries, accountIndex) {
  const postings = [];

  for (const entry of journalEntries || []) {
    const debitPosting = buildPosting(entry, "debit", accountIndex);
    const creditPosting = buildPosting(entry, "credit", accountIndex);

    if (debitPosting) {
      postings.push(debitPosting);
    }
    if (creditPosting) {
      postings.push(creditPosting);
    }
  }

  return postings;
}

function sortPeriods(periods) {
  return [...new Set(periods)].sort((a, b) => a.localeCompare(b));
}

function isDebitNormal(accountType) {
  return DEBIT_NORMAL_TYPES.has(accountType);
}

function isCashAccount(account) {
  const name = normalizeString(account).toLowerCase();
  return name === "caja" || name.startsWith("banco ");
}

function isFixedAssetAccount(meta) {
  return meta.account_type === REPORT_ACCOUNT_TYPES.asset && meta.category_level_2 === "Fixed Assets";
}

function isFinancingAccount(meta, account) {
  const category1 = normalizeString(meta.category_level_1).toLowerCase();
  const category2 = normalizeString(meta.category_level_2).toLowerCase();
  const accountName = normalizeString(account).toLowerCase();

  return (
    meta.account_type === REPORT_ACCOUNT_TYPES.equity ||
    category1 === "financing" ||
    category2 === "debt" ||
    accountName.includes("loan")
  );
}

function isTransferAccount(meta, account) {
  const category1 = normalizeString(meta.category_level_1).toLowerCase();
  const accountName = normalizeString(account).toLowerCase();

  return category1 === "transfers" || accountName.includes("transfer") || accountName.includes("clearing");
}

function classifyCashFlow(counterpartyMeta, counterpartyAccount) {
  if (isTransferAccount(counterpartyMeta, counterpartyAccount)) {
    return CASH_FLOW_SECTIONS.internal;
  }
  if (isFixedAssetAccount(counterpartyMeta)) {
    return CASH_FLOW_SECTIONS.investing;
  }
  if (isFinancingAccount(counterpartyMeta, counterpartyAccount)) {
    return CASH_FLOW_SECTIONS.financing;
  }
  return CASH_FLOW_SECTIONS.operating;
}

function buildGeneralLedger(postings, periods) {
  const ledgerByAccountMonth = new Map();

  for (const posting of postings) {
    const key = `${posting.account}__${posting.period_month}`;
    const bucket = ledgerByAccountMonth.get(key) || {
      period_month: posting.period_month,
      account: posting.account,
      total_debits: 0,
      total_credits: 0,
      ending_balance: 0,
      account_type: posting.meta.account_type,
      category_level_1: posting.meta.category_level_1,
      category_level_2: posting.meta.category_level_2
    };

    if (posting.side === "debit") {
      bucket.total_debits += posting.amount;
    } else {
      bucket.total_credits += posting.amount;
    }

    ledgerByAccountMonth.set(key, bucket);
  }

  const accounts = [...new Set(postings.map((posting) => posting.account))].sort((a, b) => a.localeCompare(b));
  const generalLedgerMonthly = [];

  for (const account of accounts) {
    let runningBalance = 0;

    for (const periodMonth of periods) {
      const key = `${account}__${periodMonth}`;
      const bucket = ledgerByAccountMonth.get(key);
      if (!bucket) {
        continue;
      }

      const periodNet = isDebitNormal(bucket.account_type)
        ? bucket.total_debits - bucket.total_credits
        : bucket.total_credits - bucket.total_debits;

      runningBalance += periodNet;

      generalLedgerMonthly.push({
        ...bucket,
        total_debits: roundCurrency(bucket.total_debits),
        total_credits: roundCurrency(bucket.total_credits),
        ending_balance: roundCurrency(runningBalance)
      });
    }
  }

  return generalLedgerMonthly;
}

function buildMonthlySalesIndex(dailySalesSummary) {
  const salesIndex = new Map();

  for (const row of dailySalesSummary || []) {
    const periodMonth = toPeriodMonth(row.date);
    const bucket = salesIndex.get(periodMonth) || {
      period_month: periodMonth,
      sales_revenue: 0,
      card_sales: 0,
      cash_sales: 0,
      tickets: 0,
      units_sold: 0
    };

    bucket.sales_revenue += Number(row.total_sales || 0);
    bucket.card_sales += Number(row.card_sales || 0);
    bucket.cash_sales += Number(row.cash_sales || 0);
    bucket.tickets += Number(row.tickets || 0);
    bucket.units_sold += Number(row.units_sold || 0);

    salesIndex.set(periodMonth, bucket);
  }

  return salesIndex;
}

function buildExpenseIndex(postings) {
  const expenseIndex = new Map();

  for (const posting of postings) {
    if (posting.side !== "debit") {
      continue;
    }
    if (posting.meta.account_type !== REPORT_ACCOUNT_TYPES.expense) {
      continue;
    }

    const key = `${posting.period_month}__${posting.account}`;
    expenseIndex.set(key, (expenseIndex.get(key) || 0) + posting.amount);
  }

  return expenseIndex;
}

function calculateEstimatedCogsByMonth(journalEntries, salesIndex) {
  const inventoryPurchasesByMonth = new Map();

  for (const entry of journalEntries || []) {
    const periodMonth = toPeriodMonth(entry.date);
    const debitAccount = normalizeString(entry.debit_account);

    if (debitAccount !== "Inventario" && debitAccount !== "Inventory") {
      continue;
    }

    inventoryPurchasesByMonth.set(
      periodMonth,
      (inventoryPurchasesByMonth.get(periodMonth) || 0) + Number(entry.amount || 0)
    );
  }

  const estimatedCogsByMonth = new Map();
  const allMonths = sortPeriods([...inventoryPurchasesByMonth.keys(), ...salesIndex.keys()]);

  for (const periodMonth of allMonths) {
    const inventoryPurchases = Number(inventoryPurchasesByMonth.get(periodMonth) || 0);
    const unitsSold = Number(salesIndex.get(periodMonth)?.units_sold || 0);
    const estimatedCogsPerUnit = unitsSold > 0 ? inventoryPurchases / unitsSold : 0;
    const estimatedCogs = estimatedCogsPerUnit * unitsSold;

    estimatedCogsByMonth.set(periodMonth, {
      period_month: periodMonth,
      inventory_purchases_in_month: roundCurrency(inventoryPurchases),
      units_sold_in_month: unitsSold,
      estimated_cogs_per_unit: roundCurrency(estimatedCogsPerUnit),
      estimated_cogs: roundCurrency(estimatedCogs)
    });
  }

  return estimatedCogsByMonth;
}

function buildIncomeStatement(periods, salesIndex, postings, estimatedCogsByMonth) {
  const expenseIndex = buildExpenseIndex(postings);
  const incomeStatementMonthly = [];
  const incomeStatementMonthlyDetail = [];

  for (const periodMonth of periods) {
    const sales = Number(salesIndex.get(periodMonth)?.sales_revenue || 0);
    const estimatedCogs = Number(estimatedCogsByMonth.get(periodMonth)?.estimated_cogs || 0);
    const expensePostings = postings.filter(
      (posting) => posting.period_month === periodMonth && posting.side === "debit" && posting.meta.account_type === REPORT_ACCOUNT_TYPES.expense
    );

    let operatingExpenses = 0;

    for (const posting of expensePostings) {
      const key = `${periodMonth}__${posting.account}`;
      const amount = Number(expenseIndex.get(key) || 0);
      if (!amount) {
        continue;
      }

      operatingExpenses += amount;
      expenseIndex.delete(key);
    }

    const grossProfit = sales - estimatedCogs;
    const netIncome = grossProfit - operatingExpenses;

    incomeStatementMonthly.push({
      period_month: periodMonth,
      sales_revenue: roundCurrency(sales),
      estimated_cogs: roundCurrency(estimatedCogs),
      gross_profit: roundCurrency(grossProfit),
      operating_expenses: roundCurrency(operatingExpenses),
      net_income: roundCurrency(netIncome)
    });

    incomeStatementMonthlyDetail.push({
      period_month: periodMonth,
      section: "revenue",
      account: "Sales Revenue",
      amount: roundCurrency(sales)
    });
    incomeStatementMonthlyDetail.push({
      period_month: periodMonth,
      section: "cogs",
      account: "Estimated COGS",
      amount: roundCurrency(estimatedCogs)
    });

    const expenseAccountsForMonth = postings
      .filter(
        (posting) =>
          posting.period_month === periodMonth &&
          posting.side === "debit" &&
          posting.meta.account_type === REPORT_ACCOUNT_TYPES.expense
      )
      .reduce((accumulator, posting) => {
        accumulator.set(posting.account, (accumulator.get(posting.account) || 0) + posting.amount);
        return accumulator;
      }, new Map());

    for (const [account, amount] of [...expenseAccountsForMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      incomeStatementMonthlyDetail.push({
        period_month: periodMonth,
        section: "operating_expense",
        account,
        amount: roundCurrency(amount)
      });
    }
  }

  return { incomeStatementMonthly, incomeStatementMonthlyDetail };
}

function buildBalanceSheet(generalLedgerMonthly, incomeStatementMonthly) {
  const rowsByMonth = new Map();
  const runningEarningsByMonth = new Map();
  let cumulativeNetIncome = 0;

  for (const row of [...incomeStatementMonthly].sort((a, b) => a.period_month.localeCompare(b.period_month))) {
    cumulativeNetIncome += Number(row.net_income || 0);
    runningEarningsByMonth.set(row.period_month, roundCurrency(cumulativeNetIncome));
  }

  for (const row of generalLedgerMonthly) {
    if (
      row.account_type !== REPORT_ACCOUNT_TYPES.asset &&
      row.account_type !== REPORT_ACCOUNT_TYPES.liability &&
      row.account_type !== REPORT_ACCOUNT_TYPES.equity
    ) {
      continue;
    }

    const section =
      row.account_type === REPORT_ACCOUNT_TYPES.asset
        ? "asset"
        : row.account_type === REPORT_ACCOUNT_TYPES.liability
          ? "liability"
          : "equity";

    const monthRows = rowsByMonth.get(row.period_month) || new Map();
    monthRows.set(row.account, {
      period_month: row.period_month,
      section,
      account: row.account,
      ending_balance: roundCurrency(row.ending_balance)
    });
    rowsByMonth.set(row.period_month, monthRows);
  }

  for (const [periodMonth, earnings] of runningEarningsByMonth.entries()) {
    const monthRows = rowsByMonth.get(periodMonth) || new Map();
    monthRows.set("Utilidad del ejercicio", {
      period_month: periodMonth,
      section: "equity",
      account: "Utilidad del ejercicio",
      ending_balance: roundCurrency(earnings)
    });
    rowsByMonth.set(periodMonth, monthRows);
  }

  const balanceSheetMonthly = [];
  const balanceSheetMonthlySummary = [];

  for (const periodMonth of sortPeriods([...rowsByMonth.keys()])) {
    const monthRows = rowsByMonth.get(periodMonth) || new Map();
    const summary = {
      period_month: periodMonth,
      total_assets: 0,
      total_liabilities: 0,
      total_equity: 0
    };

    for (const row of [...monthRows.values()].sort((a, b) => a.account.localeCompare(b.account))) {
      balanceSheetMonthly.push(row);

      if (row.section === "asset") {
        summary.total_assets += row.ending_balance;
      } else if (row.section === "liability") {
        summary.total_liabilities += row.ending_balance;
      } else {
        summary.total_equity += row.ending_balance;
      }
    }

    balanceSheetMonthlySummary.push({
      period_month: periodMonth,
      total_assets: roundCurrency(summary.total_assets),
      total_liabilities: roundCurrency(summary.total_liabilities),
      total_equity: roundCurrency(summary.total_equity)
    });
  }

  return { balanceSheetMonthly, balanceSheetMonthlySummary };
}

function buildCashFlowStatement(journalEntries, accountIndex, periods) {
  const monthlyBuckets = new Map();

  for (const periodMonth of periods) {
    monthlyBuckets.set(periodMonth, {
      period_month: periodMonth,
      operating_cash_flow: 0,
      investing_cash_flow: 0,
      financing_cash_flow: 0,
      net_change_in_cash: 0
    });
  }

  for (const entry of journalEntries || []) {
    const periodMonth = toPeriodMonth(entry.date);
    const bucket = monthlyBuckets.get(periodMonth);
    if (!bucket) {
      continue;
    }

    const debitAccount = normalizeString(entry.debit_account);
    const creditAccount = normalizeString(entry.credit_account);
    const amount = Number(entry.amount || 0);

    const debitIsCash = isCashAccount(debitAccount);
    const creditIsCash = isCashAccount(creditAccount);

    if (!debitIsCash && !creditIsCash) {
      continue;
    }

    if (debitIsCash && creditIsCash) {
      bucket.net_change_in_cash += 0;
      continue;
    }

    const cashDelta = debitIsCash ? amount : -amount;
    const counterpartyAccount = debitIsCash ? creditAccount : debitAccount;
    const counterpartyMeta =
      accountIndex.get(counterpartyAccount) ||
      inferAccountMeta(counterpartyAccount, entry, REPORT_ACCOUNT_TYPES.asset);

    const section = classifyCashFlow(counterpartyMeta, counterpartyAccount);
    if (section === CASH_FLOW_SECTIONS.operating) {
      bucket.operating_cash_flow += cashDelta;
    } else if (section === CASH_FLOW_SECTIONS.investing) {
      bucket.investing_cash_flow += cashDelta;
    } else if (section === CASH_FLOW_SECTIONS.financing) {
      bucket.financing_cash_flow += cashDelta;
    }

    bucket.net_change_in_cash += cashDelta;
  }

  return [...monthlyBuckets.values()]
    .sort((a, b) => a.period_month.localeCompare(b.period_month))
    .map((row) => ({
      period_month: row.period_month,
      operating_cash_flow: roundCurrency(row.operating_cash_flow),
      investing_cash_flow: roundCurrency(row.investing_cash_flow),
      financing_cash_flow: roundCurrency(row.financing_cash_flow),
      net_change_in_cash: roundCurrency(row.net_change_in_cash)
    }));
}

function buildMonthlyFinancialReports({
  journalEntries = [],
  dailySalesSummary = [],
  chartOfAccounts = []
} = {}) {
  const accountIndex = buildAccountIndex(chartOfAccounts);
  const salesIndex = buildMonthlySalesIndex(dailySalesSummary);
  const postings = expandJournalEntries(journalEntries, accountIndex);
  const periods = sortPeriods([
    ...postings.map((posting) => posting.period_month),
    ...salesIndex.keys()
  ]);

  const generalLedgerMonthly = buildGeneralLedger(postings, periods);
  const estimatedCogsByMonth = calculateEstimatedCogsByMonth(journalEntries, salesIndex);
  const { incomeStatementMonthly, incomeStatementMonthlyDetail } = buildIncomeStatement(
    periods,
    salesIndex,
    postings,
    estimatedCogsByMonth
  );
  const { balanceSheetMonthly, balanceSheetMonthlySummary } = buildBalanceSheet(
    generalLedgerMonthly,
    incomeStatementMonthly
  );
  const cashFlowMonthly = buildCashFlowStatement(journalEntries, accountIndex, periods);

  return {
    general_ledger_monthly: generalLedgerMonthly,
    income_statement_monthly: incomeStatementMonthly,
    income_statement_monthly_detail: incomeStatementMonthlyDetail,
    balance_sheet_monthly: balanceSheetMonthly,
    balance_sheet_monthly_summary: balanceSheetMonthlySummary,
    cash_flow_monthly: cashFlowMonthly,
    reporting_metadata: {
      generated_at: new Date().toISOString(),
      months_covered: periods,
      cogs_method: "Phase 1 estimated COGS based on monthly inventory purchases divided by monthly units sold",
      assumptions: [
        "Sales revenue comes from daily_sales_summary.total_sales, not from bank deposits.",
        "Inventory purchases are journal entries where debit_account is Inventario or Inventory.",
        "Cash flow uses only entries that touch Caja or Banco* accounts.",
        "Internal transfers between cash accounts are excluded from operating, investing, and financing subtotals."
      ]
    }
  };
}

module.exports = {
  DEFAULT_CHART_OF_ACCOUNTS,
  buildMonthlyFinancialReports
};
