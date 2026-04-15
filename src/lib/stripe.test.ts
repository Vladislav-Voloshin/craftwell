import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Stripe class mock — must be a real constructor (no arrow function)
// ---------------------------------------------------------------------------

const mockConstructEvent = vi.fn();

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: mockConstructEvent };
  }
  return { default: MockStripe };
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function importStripe() {
  return import("./stripe");
}

// ---------------------------------------------------------------------------
// PLANS
// ---------------------------------------------------------------------------

describe("PLANS", () => {
  it("contains monthly, annual, and lifetime entries", async () => {
    const { PLANS } = await importStripe();
    expect(Object.keys(PLANS)).toEqual(["monthly", "annual", "lifetime"]);
  });

  it("monthly plan has correct amount and interval", async () => {
    const { PLANS } = await importStripe();
    expect(PLANS.monthly.amount).toBe(1299);
    expect(PLANS.monthly.interval).toBe("month");
    expect(PLANS.monthly.mode).toBe("subscription");
  });

  it("annual plan has correct amount and interval", async () => {
    const { PLANS } = await importStripe();
    expect(PLANS.annual.amount).toBe(9900);
    expect(PLANS.annual.interval).toBe("year");
    expect(PLANS.annual.mode).toBe("subscription");
  });

  it("lifetime plan has correct amount, no interval, and 500 cap", async () => {
    const { PLANS } = await importStripe();
    expect(PLANS.lifetime.amount).toBe(14900);
    expect(PLANS.lifetime.interval).toBeNull();
    expect(PLANS.lifetime.mode).toBe("payment");
    expect(PLANS.lifetime.purchaseCap).toBe(500);
  });

  it("plan priceId() throws when env var is missing", async () => {
    const { PLANS } = await importStripe();
    const orig = process.env.STRIPE_PRICE_LIFETIME;
    delete process.env.STRIPE_PRICE_LIFETIME;
    try {
      expect(() => PLANS.lifetime.priceId()).toThrow("STRIPE_PRICE_LIFETIME");
    } finally {
      if (orig !== undefined) process.env.STRIPE_PRICE_LIFETIME = orig;
    }
  });

  it("plan priceId() returns env var value when set", async () => {
    const { PLANS } = await importStripe();
    process.env.STRIPE_PRICE_MONTHLY = "price_test_monthly";
    try {
      expect(PLANS.monthly.priceId()).toBe("price_test_monthly");
    } finally {
      delete process.env.STRIPE_PRICE_MONTHLY;
    }
  });
});

// ---------------------------------------------------------------------------
// getStripe()
// ---------------------------------------------------------------------------

describe("getStripe()", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("throws when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { getStripe, _resetStripeForTests } = await importStripe();
    _resetStripeForTests();
    expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY");
  });

  it("returns an object with a webhooks property when key is set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const { getStripe, _resetStripeForTests } = await importStripe();
    _resetStripeForTests();
    const stripe = getStripe();
    expect(stripe).toHaveProperty("webhooks");
  });

  it("returns the same instance on repeated calls (singleton)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const { getStripe, _resetStripeForTests } = await importStripe();
    _resetStripeForTests();
    const first = getStripe();
    const second = getStripe();
    expect(first).toBe(second);
  });

  it("_resetStripeForTests() forces re-instantiation", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const { getStripe, _resetStripeForTests } = await importStripe();
    _resetStripeForTests();
    const first = getStripe();
    _resetStripeForTests();
    const second = getStripe();
    expect(first).not.toBe(second);
  });
});

// ---------------------------------------------------------------------------
// constructWebhookEvent()
// ---------------------------------------------------------------------------

describe("constructWebhookEvent()", () => {
  beforeEach(() => {
    vi.resetModules();
    mockConstructEvent.mockReset();
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("delegates to stripe.webhooks.constructEvent with correct args", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";

    const mockEvent = { type: "payment_intent.created", id: "evt_1" };
    mockConstructEvent.mockReturnValue(mockEvent);

    const { constructWebhookEvent, _resetStripeForTests } = await importStripe();
    _resetStripeForTests();

    const result = constructWebhookEvent("raw-body", "sig-header");
    expect(mockConstructEvent).toHaveBeenCalledWith("raw-body", "sig-header", "whsec_fake");
    expect(result).toEqual(mockEvent);
  });

  it("throws when STRIPE_WEBHOOK_SECRET is missing", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const { constructWebhookEvent, _resetStripeForTests } = await importStripe();
    _resetStripeForTests();

    expect(() => constructWebhookEvent("raw-body", "sig")).toThrow("STRIPE_WEBHOOK_SECRET");
  });

  it("propagates errors thrown by webhooks.constructEvent", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });

    const { constructWebhookEvent, _resetStripeForTests } = await importStripe();
    _resetStripeForTests();

    expect(() => constructWebhookEvent("raw-body", "bad-sig")).toThrow("No signatures found");
  });
});
