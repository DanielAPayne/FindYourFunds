/*
 * Find Your Funds — source registry.
 *
 * Every source has a stable `id`. Stored tracking data is keyed by `id`, so
 * sources can be added, removed, or reordered without misassigning records.
 *
 *   type    who runs the site: gov | partner | nonprofit | commercial
 *           (partner = an official body designated by or made up of government
 *           agencies, e.g. NAUPA, NAIC, The MLC)
 *   access  how the money can be found today (see docs/ROADMAP.md):
 *           ASSISTED        user searches on the official site
 *           USER_AUTHORIZED user signs in with their own account (e.g. Login.gov)
 *           API / BULK_DATA reserved for authorized integrations (none yet)
 *   free    true when searching/claiming on that site is free of charge
 *   rel     profile tags that suggest the source is worth a look
 *           (a suggestion only, never an eligibility decision)
 *   legacy  positional key used before v3 ("c<group>_<index>"), for migration
 *   checked date the link was last verified to load
 */
(function (root) {
  const CHECKED = "2026-11-16";

  const CATEGORIES = [
    // ---- Money that may already be yours ----
    { id: "start", kind: "owed", title: "Government-wide starting points", tag: "search these first",
      desc: "Official federal hubs that point to many programs at once." },
    { id: "state", kind: "owed", title: "State unclaimed property", tag: "the most common find",
      desc: "Dormant bank accounts, uncashed paychecks, deposits, insurance payouts, and refunds are turned over to the state. Search every state you have lived or worked in, under every name you have used." },
    { id: "royalties", kind: "owed", title: "Music & creative royalties", tag: "for songwriters, artists, producers",
      desc: "If you wrote, recorded, or produced music, royalties can go unpaid when works are unregistered or ownership shares don't match. An unregistered song does not by itself mean money is waiting." },
    { id: "wages", kind: "owed", title: "Unpaid wages", tag: "owed by an employer",
      desc: "Back wages the Department of Labor recovered from employers, held for the workers they're owed to." },
    { id: "retirement", kind: "owed", title: "Retirement & pensions", tag: "old jobs count",
      desc: "Old 401(k)s, pensions from employers that closed or merged, and federal or railroad retirement benefits." },
    { id: "tax", kind: "owed", title: "Tax refunds & credits", tag: "IRS + states",
      desc: "Refunds that were never delivered, refunds for returns never filed (generally a three-year window), and refundable credits people miss." },
    { id: "court", kind: "owed", title: "Court & agency restitution", tag: "harmed-consumer funds",
      desc: "Money from court cases and enforcement actions, held for the people it belongs to." },
    { id: "banks", kind: "owed", title: "Failed banks & credit unions", tag: "closed institutions",
      desc: "Deposits left behind when regulators closed a bank or credit union." },
    { id: "bonds", kind: "owed", title: "Savings bonds", tag: "matured & forgotten",
      desc: "Treasury Hunt, the old federal search tool for matured bonds, ended September 30, 2025." },
    { id: "insurance", kind: "owed", title: "Life insurance", tag: "unclaimed policies",
      desc: "Policies a relative held that the family never knew about." },
    { id: "veterans", kind: "owed", title: "Veterans & military", tag: "service records",
      desc: "Insurance payouts and pay records for service members and their beneficiaries." },
    { id: "fha", kind: "owed", title: "Mortgage refunds", tag: "FHA loans",
      desc: "If you had an FHA-insured mortgage and paid it off early, you may be owed part of the insurance premium back." },
    { id: "local", kind: "owed", title: "Local & county funds", tag: "easy to overlook",
      desc: "Counties and cities hold their own money: property-tax overpayments, foreclosure surplus, utility deposits, bail refunds. Most of it is not in the national databases." },
    { id: "classaction", kind: "owed", title: "Class-action settlements", tag: "check carefully",
      desc: "If a company you did business with settled a lawsuit, you may be a class member. File only on the settlement administrator's official site." },

    // ---- Programs you may qualify for ----
    { id: "benefits", kind: "eligibility", title: "Benefit programs", tag: "eligibility-based",
      desc: "Programs with eligibility rules. Whether you qualify is decided by the program, not by this list." },
    { id: "education", kind: "eligibility", title: "Education & student aid", tag: "grants aren't repaid",
      desc: "Federal grants for school, and loan forgiveness or discharge programs." },
    { id: "bills", kind: "eligibility", title: "Help with bills", tag: "ongoing support",
      desc: "Programs that reduce utility, phone, and internet costs for eligible households." },
    { id: "health", kind: "eligibility", title: "Health coverage costs", tag: "subsidies & coverage",
      desc: "Premium subsidies and low-cost coverage for eligible people." },
    { id: "ss", kind: "eligibility", title: "Social Security & SSI", tag: "earned & needs-based",
      desc: "Retirement, disability, survivor, and supplemental benefits." },
    { id: "food", kind: "eligibility", title: "Food & family", tag: "monthly support",
      desc: "Nutrition and child-care programs for eligible households." },
    { id: "housing", kind: "eligibility", title: "Housing & home repair", tag: "rent + repairs",
      desc: "Rental assistance and home-repair grants. Waitlists are common." },
    { id: "disaster", kind: "eligibility", title: "Disaster aid", tag: "after a declared disaster",
      desc: "Federal assistance after a federally declared disaster." },
    { id: "rebates", kind: "eligibility", title: "Rebates & energy credits", tag: "purchase-based",
      desc: "Rebates and tax credits tied to qualifying purchases or home upgrades." },
    { id: "assistance", kind: "eligibility", title: "Emergency & community help", tag: "local programs",
      desc: "Charities and local programs that help with rent, utilities, and food." },

    // ---- Optional ways to earn ----
    { id: "offers", kind: "optional", title: "Optional earning offers", tag: "not money you're owed",
      desc: "Real incentives from companies, but you earn them by doing something: opening an account, taking part in a study, shopping through a portal. Read every offer's terms." },
    { id: "crowdfunding", kind: "optional", title: "Crowdfunding & guaranteed income", tag: "ask, or apply",
      desc: "Raising money from people who choose to give, and local pilots that send recurring cash to selected residents." },
  ];

  const S = (o) => Object.assign({ rel: [], legacy: null, free: false, access: "ASSISTED", checked: CHECKED }, o);

  const SOURCES = [
    // start
    S({ id: "usa-unclaimed-money", cat: "start", type: "gov", free: true, legacy: "c0_0",
        name: "USA.gov: Find unclaimed money",
        what: "The federal government's guide to unclaimed money from states, federal agencies, pensions, and more.",
        url: "https://www.usa.gov/unclaimed-money", host: "usa.gov" }),
    S({ id: "usa-benefit-finder", cat: "start", type: "gov", free: true, legacy: "c0_1",
        name: "USA.gov Benefit Finder",
        what: "Answer a few questions to see federal benefits you might be able to apply for. It replaced Benefits.gov in 2024.",
        url: "https://www.usa.gov/benefit-finder", host: "usa.gov" }),

    // state
    S({ id: "missingmoney", cat: "state", type: "partner", free: true, legacy: "c1_0",
        name: "MissingMoney.com (most states at once)",
        what: "The multi-state search endorsed by the National Association of Unclaimed Property Administrators. Confirm and claim on each state's own site.",
        url: "https://www.missingmoney.com", host: "missingmoney.com" }),
    S({ id: "il-icash", cat: "state", type: "gov", free: true,
        name: "Illinois: I-CASH",
        what: "The Illinois State Treasurer's official search and claim-status portal.",
        url: "https://icash.illinoistreasurer.gov", host: "icash.illinoistreasurer.gov" }),
    S({ id: "mi-unclaimed", cat: "state", type: "gov", free: true,
        name: "Michigan Unclaimed Property",
        what: "Michigan Department of Treasury search and online claims. Results show properties of $50 or more; staff add smaller ones to your claim.",
        url: "https://unclaimedproperty.michigan.gov", host: "unclaimedproperty.michigan.gov" }),
    S({ id: "ca-claimit", cat: "state", type: "gov", free: true,
        name: "California: ClaimIt",
        what: "The California State Controller's official unclaimed property search.",
        url: "https://claimit.ca.gov", host: "claimit.ca.gov" }),
    S({ id: "naupa-directory", cat: "state", type: "partner", free: true, legacy: "c1_1",
        name: "Every other state's official site",
        what: "NAUPA's directory links to each state's own unclaimed property program.",
        url: "https://unclaimed.org/", host: "unclaimed.org" }),

    // royalties
    S({ id: "mlc-search", cat: "royalties", type: "partner", free: true, rel: ["music"],
        name: "The MLC: public work search",
        what: "The Mechanical Licensing Collective pays U.S. streaming mechanical royalties to songwriters and publishers. Check that your works and ownership shares are registered and matched.",
        url: "https://portal.themlc.com/search", host: "portal.themlc.com" }),
    S({ id: "soundexchange", cat: "royalties", type: "partner", free: true, rel: ["music"],
        name: "SoundExchange",
        what: "Collects digital performance royalties for sound recordings, with a separate allocation for eligible producers. Registration is free.",
        url: "https://www.soundexchange.com", host: "soundexchange.com" }),
    S({ id: "ascap-repertory", cat: "royalties", type: "nonprofit", rel: ["music"],
        name: "ASCAP repertory search",
        what: "Check whether your works are registered with this performing rights organization.",
        url: "https://www.ascap.com/repertory", host: "ascap.com" }),
    S({ id: "bmi-repertoire", cat: "royalties", type: "commercial", rel: ["music"],
        name: "BMI repertoire search",
        what: "Check whether your works are registered with this performing rights organization.",
        url: "https://repertoire.bmi.com", host: "repertoire.bmi.com" }),

    // wages
    S({ id: "dol-wow", cat: "wages", type: "gov", free: true, rel: ["worked"], legacy: "c10_0",
        name: "DOL: Workers Owed Wages",
        what: "Search by employer for back wages held for you. A claim needs a signed form and identification.",
        url: "https://www.dol.gov/agencies/whd/wow", host: "dol.gov" }),

    // retirement
    S({ id: "dol-lost-found", cat: "retirement", type: "gov", free: true, access: "USER_AUTHORIZED", rel: ["retirement", "worked"],
        name: "DOL: Retirement Savings Lost and Found",
        what: "Look up retirement plans from past employers after signing in with Login.gov. A listed plan doesn't confirm that a benefit is owed.",
        url: "https://lostandfound.dol.gov", host: "lostandfound.dol.gov" }),
    S({ id: "pbgc-unclaimed", cat: "retirement", type: "gov", free: true, rel: ["retirement"], legacy: "c9_1",
        name: "PBGC: unclaimed pensions",
        what: "The agency that takes over failed pension plans holds benefits for people it can't locate.",
        url: "https://www.pbgc.gov/search-unclaimed-pensions", host: "pbgc.gov" }),
    S({ id: "dol-abandoned-plans", cat: "retirement", type: "gov", free: true, rel: ["retirement"], legacy: "c9_2",
        name: "DOL: abandoned plan search",
        what: "Find who now administers a plan from an employer that disappeared.",
        url: "https://www.askebsa.dol.gov/AbandonedPlanSearch", host: "askebsa.dol.gov" }),
    S({ id: "nrurb", cat: "retirement", type: "commercial", rel: ["retirement", "worked"], legacy: "c9_0",
        name: "National Registry of Unclaimed Retirement Benefits",
        what: "A privately run registry that some plan sponsors report to. Free to search.",
        url: "https://www.unclaimedretirementbenefits.com", host: "unclaimedretirementbenefits.com" }),
    S({ id: "opm-retirement", cat: "retirement", type: "gov", free: true, rel: ["fedrr"], legacy: "c9_3",
        name: "OPM: federal retirement",
        what: "Civil-service retirement and survivor benefits for former federal employees.",
        url: "https://www.opm.gov/retirement-center/", host: "opm.gov" }),
    S({ id: "rrb", cat: "retirement", type: "gov", free: true, rel: ["fedrr"], legacy: "c9_4",
        name: "Railroad Retirement Board",
        what: "Retirement and survivor benefits for railroad workers, separate from Social Security.",
        url: "https://www.rrb.gov", host: "rrb.gov" }),

    // tax
    S({ id: "irs-refunds", cat: "tax", type: "gov", free: true, legacy: "c2_0",
        name: "IRS: refunds",
        what: "Check refund status and learn how to claim a refund for a year you didn't file.",
        url: "https://www.irs.gov/refunds", host: "irs.gov" }),
    S({ id: "irs-account", cat: "tax", type: "gov", free: true, access: "USER_AUTHORIZED", legacy: "c2_3",
        name: "IRS: your online account",
        what: "After identity verification, see balances, payments, and records the IRS has for you.",
        url: "https://www.irs.gov/payments/online-account-for-individuals", host: "irs.gov" }),
    S({ id: "irs-eitc", cat: "tax", type: "gov", free: true, rel: ["lowincome", "worked"], legacy: "c2_1",
        name: "IRS: Earned Income Tax Credit",
        what: "A refundable credit for workers with low to moderate income. It can be claimed on returns for prior years within the refund window.",
        url: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc", host: "irs.gov" }),
    S({ id: "irs-ctc", cat: "tax", type: "gov", free: true, rel: ["parent"], legacy: "c2_2",
        name: "IRS: Child Tax Credit",
        what: "A credit for qualifying children, partly refundable depending on the year and your income.",
        url: "https://www.irs.gov/credits-deductions/individuals/child-tax-credit", host: "irs.gov" }),
    S({ id: "state-tax-agencies", cat: "tax", type: "nonprofit", legacy: "c2_4",
        name: "State tax agencies",
        what: "Links to every state revenue department, most of which have a refund lookup.",
        url: "https://www.taxadmin.org/state-tax-agencies", host: "taxadmin.org" }),

    // court
    S({ id: "uscourts-ucf", cat: "court", type: "gov", legacy: "c11_0",
        name: "U.S. Courts: unclaimed funds locator",
        what: "Money left in federal court cases, including bankruptcies. Some claims need a court filing, which can involve costs.",
        url: "https://ucf.uscourts.gov", host: "ucf.uscourts.gov" }),
    S({ id: "cfpb-payments", cat: "court", type: "gov", free: true, legacy: "c11_1",
        name: "CFPB: payments to harmed consumers",
        what: "Lists payments from enforcement actions against financial companies.",
        url: "https://www.consumerfinance.gov/enforcement/payments-harmed-consumers/", host: "consumerfinance.gov" }),
    S({ id: "sec-distributions", cat: "court", type: "gov", free: true, rel: ["investor"], legacy: "c11_2",
        name: "SEC: distributions to harmed investors",
        what: "Funds returned to investors harmed in cases the SEC brought.",
        url: "https://www.sec.gov/enforcement-litigation/distributions-harmed-investors", host: "sec.gov" }),

    // banks
    S({ id: "fdic-unclaimed", cat: "banks", type: "gov", free: true, legacy: "c12_0",
        name: "FDIC: unclaimed funds",
        what: "Money owed to depositors of failed banks the FDIC closed.",
        url: "https://closedbanks.fdic.gov/funds/", host: "closedbanks.fdic.gov" }),
    S({ id: "ncua-unclaimed", cat: "banks", type: "gov", free: true, legacy: "c12_1",
        name: "NCUA: unclaimed deposits",
        what: "Deposits from liquidated federal credit unions.",
        url: "https://www.ncua.gov/support-services/conservatorships-liquidations/unclaimed-deposits", host: "ncua.gov" }),

    // bonds
    S({ id: "treasury-savings-bonds", cat: "bonds", type: "gov", free: true, legacy: "c13_0",
        name: "TreasuryDirect: savings bonds",
        what: "Treasury Hunt is gone. Search your state's unclaimed property program for matured bonds, and use TreasuryDirect for lost, stolen, or destroyed paper bonds.",
        url: "https://www.treasurydirect.gov/savings-bonds/", host: "treasurydirect.gov" }),

    // insurance
    S({ id: "naic-locator", cat: "insurance", type: "partner", free: true, legacy: "c14_0",
        name: "NAIC: Life Insurance Policy Locator",
        what: "State insurance regulators ask participating insurers to search for policies naming you. Generally used after a death.",
        url: "https://eapps.naic.org/life-policy-locator/", host: "eapps.naic.org" }),

    // veterans
    S({ id: "va-unclaimed-insurance", cat: "veterans", type: "gov", free: true, rel: ["veteran"], legacy: "c15_0",
        name: "VA: unclaimed insurance funds",
        what: "Insurance payouts and dividends owed to veterans and beneficiaries.",
        url: "https://www.benefits.va.gov/insurance/unclaimed_funds.asp", host: "benefits.va.gov" }),
    S({ id: "dfas-retired", cat: "veterans", type: "gov", free: true, rel: ["veteran"], legacy: "c15_1",
        name: "DFAS: retired military pay",
        what: "Retired and former military pay accounts.",
        url: "https://www.dfas.mil/RetiredMilitary/", host: "dfas.mil" }),

    // fha
    S({ id: "fha-refunds", cat: "fha", type: "gov", free: true, rel: ["fha", "homeowner"], legacy: "c16_0",
        name: "FHA mortgage insurance refunds",
        what: "USA.gov explains who may qualify and links to HUD's lookup. HUD does not charge to issue a refund.",
        url: "https://www.usa.gov/unclaimed-money", host: "usa.gov" }),

    // local
    S({ id: "local-funds", cat: "local", type: "partner", legacy: "c20_0",
        name: "Your county & city",
        what: "Search your county treasurer and clerk-of-court sites for 'unclaimed funds' or 'tax surplus'. Surplus recovery agents may ask for a large cut; you can usually file yourself.",
        url: "https://unclaimed.org/", host: "unclaimed.org, then local sites" }),

    // classaction
    S({ id: "classaction-org", cat: "classaction", type: "commercial", legacy: "c21_0",
        name: "Open class-action settlements",
        what: "A privately run roundup of settlements taking claims. File only on the official administrator's site it links to.",
        url: "https://www.classaction.org/settlements", host: "classaction.org" }),

    // benefits
    S({ id: "medicare-extra-help", cat: "benefits", type: "gov", free: true, rel: ["senior"], legacy: "c3_1",
        name: "Medicare: help with costs",
        what: "Extra Help and Medicare Savings Programs can lower premiums and drug costs for people who qualify.",
        url: "https://www.medicare.gov/basics/costs/help/drug-costs", host: "medicare.gov" }),
    S({ id: "va-benefits", cat: "benefits", type: "gov", free: true, rel: ["veteran"], legacy: "c15_2",
        name: "VA benefits",
        what: "Disability compensation, pension, education, and home-loan benefits for veterans.",
        url: "https://www.benefits.va.gov/benefits/", host: "benefits.va.gov" }),

    // education
    S({ id: "fafsa", cat: "education", type: "gov", free: true, rel: ["student"], legacy: "c4_0",
        name: "Federal Student Aid (FAFSA)",
        what: "The application for Pell Grants, work-study, and most state aid.",
        url: "https://studentaid.gov", host: "studentaid.gov" }),
    S({ id: "federal-grants-students", cat: "education", type: "gov", free: true, rel: ["student"], legacy: "c4_1",
        name: "Federal grants for students",
        what: "Grants that generally don't have to be repaid.",
        url: "https://studentaid.gov/understand-aid/types/grants", host: "studentaid.gov" }),
    S({ id: "loan-forgiveness", cat: "education", type: "gov", free: true, rel: ["loans"], legacy: "c4_2",
        name: "Student loan forgiveness & discharge",
        what: "Public Service Loan Forgiveness, borrower defense, closed-school and disability discharge.",
        url: "https://studentaid.gov/manage-loans/forgiveness-cancellation", host: "studentaid.gov" }),
    S({ id: "usa-financial-aid", cat: "education", type: "gov", free: true, rel: ["student"], legacy: "c4_3",
        name: "Scholarships & financial aid guide",
        what: "The government's guide to scholarships and aid. Be wary of services that charge to find scholarships.",
        url: "https://www.usa.gov/financial-aid", host: "usa.gov" }),

    // bills
    S({ id: "liheap", cat: "bills", type: "gov", free: true, rel: ["lowincome"], legacy: "c5_0",
        name: "LIHEAP: energy bill help",
        what: "Help paying heating and cooling bills, run through your state or tribe.",
        url: "https://www.acf.hhs.gov/ocs/programs/liheap", host: "acf.hhs.gov" }),
    S({ id: "weatherization", cat: "bills", type: "gov", free: true, rel: ["lowincome", "homeowner"], legacy: "c5_1",
        name: "Weatherization Assistance Program",
        what: "Energy upgrades at no cost for income-eligible households.",
        url: "https://www.energy.gov/scep/wap/weatherization-assistance-program", host: "energy.gov" }),
    S({ id: "lifeline", cat: "bills", type: "gov", free: true, rel: ["lowincome"], legacy: "c5_2",
        name: "Lifeline: phone & internet discount",
        what: "A monthly discount on phone or broadband service for eligible households.",
        url: "https://www.fcc.gov/lifeline", host: "fcc.gov" }),
    S({ id: "usa-utility-help", cat: "bills", type: "gov", free: true, rel: ["lowincome"], legacy: "c5_3",
        name: "Utility & water bill help",
        what: "USA.gov's guide to utility and water assistance programs.",
        url: "https://www.usa.gov/help-with-utility-bills", host: "usa.gov" }),

    // health
    S({ id: "healthcare-gov", cat: "health", type: "gov", free: true, rel: ["lowincome"], legacy: "c6_0",
        name: "HealthCare.gov",
        what: "Marketplace plans with income-based premium tax credits.",
        url: "https://www.healthcare.gov", host: "healthcare.gov" }),
    S({ id: "medicaid", cat: "health", type: "gov", free: true, rel: ["lowincome", "parent"], legacy: "c6_1",
        name: "Medicaid & CHIP",
        what: "Low-cost or no-cost coverage for eligible adults and children.",
        url: "https://www.medicaid.gov", host: "medicaid.gov" }),

    // ss
    S({ id: "ssa-benefits", cat: "ss", type: "gov", free: true, rel: ["senior"], legacy: "c7_0",
        name: "Social Security benefits",
        what: "Retirement, disability, and survivor benefits, including benefits based on a family member's record.",
        url: "https://www.ssa.gov/benefits", host: "ssa.gov" }),
    S({ id: "ssi", cat: "ss", type: "gov", free: true, rel: ["lowincome", "senior"], legacy: "c7_1",
        name: "Supplemental Security Income (SSI)",
        what: "Monthly payments for people with limited income and resources who are 65 or older, blind, or disabled.",
        url: "https://www.ssa.gov/ssi", host: "ssa.gov" }),

    // food
    S({ id: "snap", cat: "food", type: "gov", free: true, rel: ["lowincome"], legacy: "c8_0",
        name: "SNAP (food assistance)",
        what: "Monthly grocery benefits for eligible households, applied for through your state.",
        url: "https://www.fns.usda.gov/snap/supplemental-nutrition-assistance-program", host: "fns.usda.gov" }),
    S({ id: "wic", cat: "food", type: "gov", free: true, rel: ["parent", "lowincome"], legacy: "c8_1",
        name: "WIC",
        what: "Food and nutrition support for pregnant people, new parents, and young children.",
        url: "https://www.fns.usda.gov/wic", host: "fns.usda.gov" }),
    S({ id: "childcare", cat: "food", type: "gov", free: true, rel: ["parent"], legacy: "c8_2",
        name: "Child care financial assistance",
        what: "State programs that help pay for child care.",
        url: "https://childcare.gov", host: "childcare.gov" }),

    // housing
    S({ id: "hud-rental", cat: "housing", type: "gov", free: true, rel: ["renter", "lowincome"], legacy: "c18_0",
        name: "HUD: rental assistance",
        what: "Housing choice vouchers and subsidized housing.",
        url: "https://www.hud.gov/topics/rental_assistance", host: "hud.gov" }),
    S({ id: "usda-home-repair", cat: "housing", type: "gov", free: true, rel: ["homeowner", "lowincome", "senior"], legacy: "c18_1",
        name: "USDA: home repair loans & grants",
        what: "Repair loans, and grants for older very-low-income rural homeowners.",
        url: "https://www.rd.usda.gov/programs-services/single-family-housing-programs/single-family-housing-repair-loans-grants", host: "rd.usda.gov" }),

    // disaster
    S({ id: "disaster-assistance", cat: "disaster", type: "gov", free: true, rel: ["disaster"], legacy: "c19_0",
        name: "DisasterAssistance.gov",
        what: "One application for FEMA and other federal disaster help.",
        url: "https://www.disasterassistance.gov", host: "disasterassistance.gov" }),

    // rebates
    S({ id: "energystar-rebates", cat: "rebates", type: "gov", free: true, rel: ["homeowner"], legacy: "c17_0",
        name: "ENERGY STAR rebate finder",
        what: "Utility and manufacturer rebates by ZIP code.",
        url: "https://www.energystar.gov/rebate-finder", host: "energystar.gov" }),
    S({ id: "energy-credits", cat: "rebates", type: "gov", free: true, rel: ["homeowner"], legacy: "c17_1",
        name: "Energy.gov: home energy savings",
        what: "Federal guidance on home energy tax credits and savings.",
        url: "https://www.energy.gov/save", host: "energy.gov" }),

    // assistance
    S({ id: "211", cat: "assistance", type: "nonprofit", free: true, rel: ["lowincome"], legacy: "c22_0",
        name: "211",
        what: "United Way's 211 connects you to local help with rent, utilities, food, and emergencies. Dial 211 or search online.",
        url: "https://www.211.org", host: "211.org" }),
    S({ id: "findhelp", cat: "assistance", type: "commercial", free: true, rel: ["lowincome"], legacy: "c22_1",
        name: "findhelp.org",
        what: "Search free and reduced-cost local programs by ZIP code.",
        url: "https://www.findhelp.org", host: "findhelp.org" }),
    S({ id: "grants-gov", cat: "assistance", type: "gov", free: true, legacy: "c22_2",
        name: "Grants.gov (read this first)",
        what: "Federal grants mostly go to organizations, not individuals. Offers of 'free government grant money' for personal bills are a common scam.",
        url: "https://www.grants.gov", host: "grants.gov" }),

    // offers
    S({ id: "bank-bonuses", cat: "offers", type: "commercial", legacy: "c23_0",
        name: "Bank & brokerage sign-up bonuses",
        what: "A privately run tracker of account-opening bonuses. Terms often require direct deposits or minimum balances, and bonuses are usually taxable.",
        url: "https://www.doctorofcredit.com/best-bank-account-bonuses/", host: "doctorofcredit.com" }),
    S({ id: "userinterviews", cat: "offers", type: "commercial", legacy: "c23_1",
        name: "Paid research studies: User Interviews",
        what: "Companies pay for product feedback sessions. Never pay to join a study.",
        url: "https://www.userinterviews.com", host: "userinterviews.com" }),
    S({ id: "respondent", cat: "offers", type: "commercial", legacy: "c23_2",
        name: "Paid research studies: Respondent",
        what: "A paid-research marketplace, often for professional studies.",
        url: "https://www.respondent.io", host: "respondent.io" }),
    S({ id: "clinicaltrials", cat: "offers", type: "gov", free: true, legacy: "c23_3",
        name: "Clinical studies",
        what: "Some studies compensate participants. Compensation and risks vary; read the consent form.",
        url: "https://clinicaltrials.gov", host: "clinicaltrials.gov" }),
    S({ id: "rakuten", cat: "offers", type: "commercial", legacy: "c23_4",
        name: "Cashback portals (Rakuten)",
        what: "A percentage back on purchases made through the portal.",
        url: "https://www.rakuten.com", host: "rakuten.com" }),

    // crowdfunding
    S({ id: "gofundme", cat: "crowdfunding", type: "commercial", legacy: "c24_0",
        name: "GoFundMe",
        what: "Raise money from people who choose to give. Platform and payment fees apply to donations.",
        url: "https://www.gofundme.com", host: "gofundme.com" }),
    S({ id: "guaranteed-income", cat: "crowdfunding", type: "nonprofit", rel: ["lowincome"], legacy: "c24_1",
        name: "Guaranteed-income pilots",
        what: "Tracks city programs that send monthly cash to selected residents.",
        url: "https://www.mayorsforagi.org", host: "mayorsforagi.org" }),
  ];

  // Retired v2 entries. Data either moves to the current source that replaced
  // it, or is kept under a retired id (stored and backed up, never shown or
  // counted) so it isn't attached to an unrelated source.
  const LEGACY_ALIASES = { c3_0: "usa-benefit-finder", c17_2: "retired-gift-cards" };
  const RETIRED_IDS = ["retired-gift-cards"];

  const PROFILE_TAGS = [
    { id: "worked",     label: "Worked a W-2 job" },
    { id: "retirement", label: "Had a 401(k) or pension" },
    { id: "music",      label: "Write, record, or produce music" },
    { id: "fedrr",      label: "Federal or railroad worker" },
    { id: "veteran",    label: "Veteran or military family" },
    { id: "investor",   label: "Had investments" },
    { id: "student",    label: "Student or paying for school" },
    { id: "loans",      label: "Have student loans" },
    { id: "homeowner",  label: "Own a home" },
    { id: "fha",        label: "Had an FHA mortgage" },
    { id: "renter",     label: "Rent my home" },
    { id: "parent",     label: "Have kids" },
    { id: "senior",     label: "65 or older" },
    { id: "lowincome",  label: "Low to moderate income" },
    { id: "disaster",   label: "Hit by a declared disaster" },
  ];

  const TYPE_LABELS = { gov: "Government", partner: "Official partner", nonprofit: "Nonprofit", commercial: "Commercial" };
  const ACCESS_LABELS = {
    ASSISTED: "You search on the official site",
    USER_AUTHORIZED: "Requires signing in with your own account",
    API: "Searched automatically",
    BULK_DATA: "Searched from published data",
    UNAVAILABLE: "No search available",
  };

  const api = { CATEGORIES, SOURCES, LEGACY_ALIASES, RETIRED_IDS, PROFILE_TAGS, TYPE_LABELS, ACCESS_LABELS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FYFRegistry = api;
})(typeof self !== "undefined" ? self : this);
