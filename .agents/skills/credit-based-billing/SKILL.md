---
name: credit-based-billing
description: Guide for implementing credit-based billing with Dodo Payments - credit entitlements, balances, ledger management, rollover, overage, and meter-based deduction.
---

# Dodo Payments Credit-Based Billing

**Reference: [docs.dodopayments.com/features/credit-based-billing](https://docs.dodopayments.com/features/credit-based-billing)**

Grant customers a balance of credits (API calls, tokens, compute units, or any custom metric) and deduct from that balance as they consume your service.

---

## Overview

Credit-based billing lets you:
- **Issue credits** with subscriptions, one-time purchases, or via API
- **Deduct automatically** via usage meters or manually via API
- **Configure rollover** to carry unused credits forward
- **Handle overage** when credits run out mid-cycle
- **Set expiration** rules per credit entitlement
- **Track everything** via a full audit ledger

Credits work across all product types: subscriptions, one-time purchases, and usage-based billing.

---

## Core Concepts

### Credit Types

| Type | Description | Best For |
|------|-------------|----------|
| **Custom Unit** | Your own metric (tokens, API calls, compute hours) with configurable precision (0–3 decimals) | API calls, AI tokens, compute hours, messages |
| **Fiat Credits** | Real currency value (USD, EUR, etc.) that depletes as customers use your service | Prepaid balances, promotional credits, compensation |

### Credit Lifecycle

1. **Credits Issued** — Granted on purchase (subscription cycle or one-time) or via API
2. **Credits Consumed** — Deducted via meter events or manual API calls
3. **Credits Expire or Roll Over** — At cycle end, unused credits expire or carry forward
4. **Overage Handling** — If balance hits zero, overage is forgiven, billed, or carried as deficit

### Grant Sources

| Source | Description |
|--------|-------------|
| **Subscription** | Credits issued each billing cycle |
| **One-Time** | Credits issued with a one-time payment |
| **API** | Credits granted manually via API or dashboard |
| **Rollover** | Credits carried over from a previous billing cycle |

---

## Quick Start

### 1. Create a Credit Entitlement

```typescript
import DodoPayments from 'dodopayments';

const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
});

const credit = await client.creditEntitlements.create({
  name: 'API Credits',
  credit_type: 'custom_unit',
  unit_name: 'API Calls',
  precision: 0,
  expiry_duration: 30, // days
  rollover_enabled: false,
  allow_overage: false,
});
```

### 2. Attach Credits to a Product

In Dashboard → Products → Create/Edit Product → Entitlements → Attach Credits:
- Select the credit entitlement
- Set credits issued per billing cycle (subscriptions) or total (one-time)
- Configure trial credits, proration, low balance threshold

### 3. Create Checkout with Credit Product

```typescript
const session = await client.checkoutSessions.create({
  product_cart: [
    {
      product_id: 'prod_ai_pro_plan', // Product with credits attached
      quantity: 1,
    }
  ],
  customer: { email: 'customer@example.com' },
  return_url: 'https://yourapp.com/success',
});

// Redirect to session.checkout_url
```

### 4. Deduct Credits via Usage Events

```typescript
// Meter linked to credit entitlement deducts automatically
await client.usageEvents.ingest({
  events: [{
    event_id: `gen_${Date.now()}_${crypto.randomUUID()}`,
    customer_id: 'cus_abc123',
    event_name: 'ai.generation',
    timestamp: new Date().toISOString(),
    metadata: { model: 'gpt-4', tokens: '1500' }
  }]
});
```

### 5. Check Balance

```typescript
const balance = await client.creditEntitlements.balances.get(
  'cent_credit_id',
  'cus_abc123'
);

console.log(`Available: ${balance.available_balance}`);
console.log(`Overage: ${balance.overage_balance}`);
```

---

## API Reference

### Credit Entitlement CRUD

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create | `POST` | `/credit-entitlements` |
| List | `GET` | `/credit-entitlements` |
| Get | `GET` | `/credit-entitlements/{id}` |
| Update | `PATCH` | `/credit-entitlements/{id}` |
| Delete | `DELETE` | `/credit-entitlements/{id}` |
| Undelete | `POST` | `/credit-entitlements/{id}/undelete` |

### Balance & Ledger Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List All Balances | `GET` | `/credit-entitlements/{id}/balances` |
| Get Customer Balance | `GET` | `/credit-entitlements/{id}/balances/{customer_id}` |
| Create Ledger Entry | `POST` | `/credit-entitlements/{id}/balances/{customer_id}/ledger-entries` |
| List Customer Ledger | `GET` | `/credit-entitlements/{id}/balances/{customer_id}/ledger` |
| List Customer Grants | `GET` | `/credit-entitlements/{id}/balances/{customer_id}/grants` |

---

## Implementation Examples

### TypeScript/Node.js

#### Create Credit Entitlement

```typescript
import DodoPayments from 'dodopayments';

const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
});

// Custom unit credit (AI tokens)
const tokenCredit = await client.creditEntitlements.create({
  name: 'AI Tokens',
  credit_type: 'custom_unit',
  unit_name: 'tokens',
  precision: 0,
  expiry_duration: 30,
  rollover_enabled: true,
  max_rollover_percentage: 25,
  rollover_timeframe: 'month',
  max_rollover_count: 3,
  allow_overage: true,
  overage_limit: 50000,
  price_per_unit: 0.001,
  overage_behavior: 'bill_overage_at_billing',
});

// Fiat credit (USD balance)
const usdCredit = await client.creditEntitlements.create({
  name: 'Platform Credits',
  credit_type: 'fiat',
  unit_currency: 'USD',
  expiry_duration: 90,
  rollover_enabled: false,
  allow_overage: false,
});
```

#### Manual Credit/Debit via Ledger Entry

```typescript
// Grant credits manually (e.g., promotional bonus)
await client.creditEntitlements.balances.createLedgerEntry(
  'cent_credit_id',
  'cus_abc123',
  {
    type: 'credit',
    amount: '500',
    description: 'Welcome bonus - 500 free API credits',
    idempotency_key: `welcome_bonus_${customerId}`,
  }
);

// Debit credits manually (e.g., service compensation deduction)
await client.creditEntitlements.balances.createLedgerEntry(
  'cent_credit_id',
  'cus_abc123',
  {
    type: 'debit',
    amount: '100',
    description: 'Manual deduction for premium support',
    idempotency_key: `support_deduction_${Date.now()}`,
  }
);
```

#### Query Customer Balance and Ledger

```typescript
// Get current balance
const balance = await client.creditEntitlements.balances.get(
  'cent_credit_id',
  'cus_abc123'
);
console.log(`Balance: ${balance.available_balance}`);

// List all balances for a credit entitlement
const allBalances = await client.creditEntitlements.balances.list(
  'cent_credit_id'
);

// Get full transaction history
const ledger = await client.creditEntitlements.balances.listLedger(
  'cent_credit_id',
  'cus_abc123'
);

for (const entry of ledger.items) {
  console.log(`${entry.type}: ${entry.amount} | Balance: ${entry.balance_after}`);
}

// List credit grants
const grants = await client.creditEntitlements.balances.listGrants(
  'cent_credit_id',
  'cus_abc123'
);
```

#### Update Credit Entitlement Settings

```typescript
await client.creditEntitlements.update('cent_credit_id', {
  rollover_enabled: true,
  max_rollover_percentage: 50,
  allow_overage: true,
  overage_limit: 10000,
  price_per_unit: 0.002,
  overage_behavior: 'bill_overage_at_billing',
});
```

### Python

```python
from dodopayments import DodoPayments
import os
import uuid
from datetime import datetime

client = DodoPayments(bearer_token=os.environ["DODO_PAYMENTS_API_KEY"])

# Create credit entitlement
credit = client.credit_entitlements.create(
    name="AI Tokens",
    credit_type="custom_unit",
    unit_name="tokens",
    precision=0,
    expiry_duration=30,
    rollover_enabled=True,
    max_rollover_percentage=25,
    allow_overage=True,
    overage_limit=50000,
    price_per_unit=0.001,
    overage_behavior="bill_overage_at_billing",
)

# Grant credits manually
client.credit_entitlements.balances.create_ledger_entry(
    credit_entitlement_id="cent_credit_id",
    customer_id="cus_abc123",
    type="credit",
    amount="500",
    description="Promotional bonus",
    idempotency_key=f"promo_{uuid.uuid4()}",
)

# Check balance
balance = client.credit_entitlements.balances.get(
    credit_entitlement_id="cent_credit_id",
    customer_id="cus_abc123",
)
print(f"Available: {balance.available_balance}")

# Send usage events that deduct credits
client.usage_events.ingest(events=[{
    "event_id": f"api_{datetime.now().timestamp()}_{uuid.uuid4()}",
    "customer_id": "cus_abc123",
    "event_name": "ai.tokens",
    "timestamp": datetime.now().isoformat(),
    "metadata": {"tokens": "1500", "model": "gpt-4"}
}])
```

### Go

```go
package main

import (
    "context"
    "fmt"
    "os"
    "time"

    "github.com/dodopayments/dodopayments-go"
    "github.com/google/uuid"
)

func main() {
    client := dodopayments.NewClient(
        option.WithBearerToken(os.Getenv("DODO_PAYMENTS_API_KEY")),
    )

    ctx := context.Background()

    // Create credit entitlement
    credit, err := client.CreditEntitlements.Create(ctx, &dodopayments.CreditEntitlementCreateParams{
        Name:       "AI Tokens",
        CreditType: "custom_unit",
        UnitName:   "tokens",
        Precision:  0,
    })
    if err != nil {
        panic(err)
    }

    // Get customer balance
    balance, err := client.CreditEntitlements.Balances.Get(ctx, credit.ID, "cus_abc123")
    if err != nil {
        panic(err)
    }
    fmt.Printf("Balance: %s\n", balance.AvailableBalance)

    // Send usage events
    _, err = client.UsageEvents.Ingest(ctx, &dodopayments.UsageEventIngestParams{
        Events: []dodopayments.UsageEvent{{
            EventID:    fmt.Sprintf("api_%d_%s", time.Now().Unix(), uuid.New().String()),
            CustomerID: "cus_abc123",
            EventName:  "ai.tokens",
            Timestamp:  time.Now().Format(time.RFC3339),
            Metadata: map[string]string{
                "tokens": "1500",
                "model":  "gpt-4",
            },
        }},
    })
    if err != nil {
        panic(err)
    }
}
```

---

## Credit Settings

### Rollover

Carry unused credits forward to the next billing cycle:

| Setting | Description |
|---------|-------------|
| **Rollover Enabled** | Toggle to allow unused credits to carry forward |
| **Max Rollover Percentage** | Limit how much carries over (0–100%) |
| **Rollover Timeframe** | How long rolled-over credits remain valid (day, week, month, year) |
| **Max Rollover Count** | Maximum consecutive rollovers before credits are forfeited |

**Example**: 200 unused credits at cycle end, 75% rollover → 150 credits carry forward, 50 forfeited.

### Overage

Controls what happens when a customer's balance reaches zero mid-cycle:

| Setting | Description |
|---------|-------------|
| **Allow Overage** | Let customers continue past zero balance |
| **Overage Limit** | Max credits consumable beyond balance |
| **Price Per Unit** | Cost per additional credit (with currency) |
| **Overage Behavior** | How overage is handled at cycle end |

**Overage Behaviors:**

| Behavior | Description |
|----------|-------------|
| **Forgive overage at reset** | Overage tracked but not billed (default) |
| **Bill overage at billing** | Overage charged on next invoice |
| **Carry over deficit** | Negative balance carries into next cycle |
| **Carry over deficit (auto-repay)** | Deficit auto-repaid from new credits next cycle |

### Expiration

| Setting | Description |
|---------|-------------|
| **Credit Expiry** | Duration after issuance: 7, 30, 60, 90, custom days, or never |
| **Trial Credits Expire After Trial** | Whether trial-specific credits expire when trial ends |

---

## Webhook Events

Credit-based billing fires these webhook events:

| Event | Description |
|-------|-------------|
| `credit.added` | Credits granted to a customer |
| `credit.deducted` | Credits consumed through usage or manual debit |
| `credit.expired` | Unused credits expired |
| `credit.rolled_over` | Credits carried forward to a new grant |
| `credit.rollover_forfeited` | Credits forfeited at max rollover count |
| `credit.overage_charged` | Overage charges applied |
| `credit.manual_adjustment` | Manual credit/debit adjustment made |
| `credit.balance_low` | Balance dropped below configured threshold |

### Webhook Handler Example

```typescript
// app/api/webhooks/dodo/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const event = await req.json();

  switch (event.type) {
    case 'credit.added':
      await handleCreditAdded(event.data);
      break;
    case 'credit.deducted':
      await handleCreditDeducted(event.data);
      break;
    case 'credit.balance_low':
      await handleBalanceLow(event.data);
      break;
    case 'credit.expired':
      await handleCreditExpired(event.data);
      break;
    case 'credit.overage_charged':
      await handleOverageCharged(event.data);
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCreditAdded(data: any) {
  const { customer_id, credit_entitlement_id, amount, balance_after } = data;
  
  // Update internal records
  await prisma.creditBalance.upsert({
    where: { customerId_creditId: { customerId: customer_id, creditId: credit_entitlement_id } },
    create: { customerId: customer_id, creditId: credit_entitlement_id, balance: balance_after },
    update: { balance: balance_after },
  });
}

async function handleCreditDeducted(data: any) {
  const { customer_id, credit_entitlement_id, amount, balance_after } = data;

  await prisma.creditBalance.update({
    where: { customerId_creditId: { customerId: customer_id, creditId: credit_entitlement_id } },
    data: { balance: balance_after },
  });
}

async function handleBalanceLow(data: any) {
  const {
    customer_id,
    credit_entitlement_name,
    available_balance,
    threshold_percent,
  } = data;

  // Notify the customer
  await sendEmail(customer_id, {
    subject: `Your ${credit_entitlement_name} balance is running low`,
    body: `You have ${available_balance} credits remaining (${threshold_percent}% threshold reached). Consider upgrading your plan or purchasing additional credits.`,
  });
}

async function handleCreditExpired(data: any) {
  const { customer_id, credit_entitlement_id, amount, balance_after } = data;

  await prisma.creditBalance.update({
    where: { customerId_creditId: { customerId: customer_id, creditId: credit_entitlement_id } },
    data: { balance: balance_after },
  });

  // Optionally notify customer
  await sendCreditExpiryNotification(customer_id, amount);
}

async function handleOverageCharged(data: any) {
  const { customer_id, credit_entitlement_id, amount, overage_after } = data;

  // Track overage for billing
  await prisma.overageRecord.create({
    data: {
      customerId: customer_id,
      creditId: credit_entitlement_id,
      amount,
      overageBalance: overage_after,
    },
  });
}
```

### Balance Low Payload

The `credit.balance_low` event has a distinct payload:

```json
{
  "business_id": "bus_xxxxx",
  "type": "credit.balance_low",
  "timestamp": "2025-08-04T06:15:00.000000Z",
  "data": {
    "payload_type": "CreditBalanceLow",
    "customer_id": "cus_xxxxx",
    "subscription_id": "sub_xxxxx",
    "credit_entitlement_id": "cent_xxxxx",
    "credit_entitlement_name": "API Credits",
    "available_balance": "15",
    "subscription_credits_amount": "100",
    "threshold_percent": 20,
    "threshold_amount": "20"
  }
}
```

---

## Usage Billing with Credits

When credits are linked to usage meters, meter events automatically deduct credits. A background worker processes events every minute, converts meter units to credits using your configured rate, and deducts using FIFO ordering (oldest grants first).

### How It Works

1. **Your app sends usage events** — Each event includes customer ID, event name, and metadata
2. **Meters aggregate events** — Using Count, Sum, Max, Last, or Unique Count
3. **Credits are deducted automatically** — Converted at your configured `meter_units_per_credit` rate
4. **Overage is tracked** — If balance reaches zero and overage is enabled, usage continues

### Meter-Credit Configuration

In Dashboard → Products → Usage-Based Product → Select Meter:
1. Toggle **Bill usage in Credits**
2. Select the credit entitlement
3. Set **Meter units per credit** (e.g., 1000 API calls = 1 credit)
4. Set **Free Threshold** (units free before credit deduction begins)

### AI Token Billing Example

```typescript
import DodoPayments from 'dodopayments';

const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
});

// Track AI token usage — meter auto-deducts credits
async function trackAIUsage(
  customerId: string,
  promptTokens: number,
  completionTokens: number,
  model: string
) {
  const totalTokens = promptTokens + completionTokens;

  await client.usageEvents.ingest({
    events: [{
      event_id: `ai_${Date.now()}_${crypto.randomUUID()}`,
      customer_id: customerId,
      event_name: 'ai.tokens',
      timestamp: new Date().toISOString(),
      metadata: {
        tokens: totalTokens.toString(),
        prompt_tokens: promptTokens.toString(),
        completion_tokens: completionTokens.toString(),
        model,
      }
    }]
  });
}

// After AI completion
await trackAIUsage('cus_abc123', 500, 1200, 'gpt-4');
```

### API Rate Tracking Example

```typescript
// Middleware to track and deduct API credits
async function trackAPICredit(customerId: string, req: Request) {
  await client.usageEvents.ingest({
    events: [{
      event_id: `api_${Date.now()}_${crypto.randomUUID()}`,
      customer_id: customerId,
      event_name: 'api.call',
      timestamp: new Date().toISOString(),
      metadata: {
        endpoint: new URL(req.url).pathname,
        method: req.method,
      }
    }]
  });
}
```

---

## Next.js Integration

### Credit Balance API Route

```typescript
// app/api/credits/balance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import DodoPayments from 'dodopayments';

const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
});

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customer_id');
  const creditId = req.nextUrl.searchParams.get('credit_id');

  if (!customerId || !creditId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const balance = await client.creditEntitlements.balances.get(creditId, customerId);

    return NextResponse.json({
      available: balance.available_balance,
      overage: balance.overage_balance,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### Manual Credit Grant API Route

```typescript
// app/api/credits/grant/route.ts
import { NextRequest, NextResponse } from 'next/server';
import DodoPayments from 'dodopayments';

const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
});

export async function POST(req: NextRequest) {
  const { customerId, creditId, amount, description } = await req.json();

  try {
    const entry = await client.creditEntitlements.balances.createLedgerEntry(
      creditId,
      customerId,
      {
        type: 'credit',
        amount: amount.toString(),
        description,
        idempotency_key: `grant_${customerId}_${Date.now()}`,
      }
    );

    return NextResponse.json({ success: true, balance_after: entry.balance_after });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### Credit Balance Hook

```typescript
// hooks/useCreditBalance.ts
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useCreditBalance(customerId: string, creditId: string) {
  const { data, error, mutate } = useSWR(
    `/api/credits/balance?customer_id=${customerId}&credit_id=${creditId}`,
    fetcher,
    { refreshInterval: 30000 } // Refresh every 30s
  );

  return {
    available: data?.available,
    overage: data?.overage,
    isLoading: !error && !data,
    isError: error,
    refresh: mutate,
  };
}

// Usage in component
function CreditDisplay() {
  const { available, isLoading } = useCreditBalance('cus_abc123', 'cent_xxxxx');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h3>Credits Remaining</h3>
      <p className="text-3xl font-bold">{available}</p>
    </div>
  );
}
```

---

## Common Patterns

### Credit Top-Up (One-Time Purchase)

Sell credit packs as one-time products:

```typescript
// Product: "500 API Credit Pack" with 500 credits attached
const session = await client.checkoutSessions.create({
  product_cart: [
    { product_id: 'prod_credit_pack_500', quantity: 1 }
  ],
  customer: { email: 'customer@example.com' },
  return_url: 'https://yourapp.com/credits/success',
});
```

### Subscription with Credits + Overage

```typescript
// Product: Pro Plan - $49/month, 10,000 tokens included, $0.002/token overage
// Credits attached in dashboard with:
//   - Credits per cycle: 10000
//   - Allow overage: true
//   - Price per unit: $0.002
//   - Overage behavior: Bill overage at billing

const session = await client.checkoutSessions.create({
  product_cart: [
    { product_id: 'prod_pro_with_credits', quantity: 1 }
  ],
  subscription_data: { trial_period_days: 14 },
  customer: { email: 'customer@example.com' },
  return_url: 'https://yourapp.com/success',
});
```

### Access Control Based on Credits

```typescript
// Middleware to check credit balance before allowing API access
async function requireCredits(customerId: string, creditId: string): Promise<boolean> {
  try {
    const balance = await client.creditEntitlements.balances.get(creditId, customerId);
    const available = parseFloat(balance.available_balance);
    return available > 0;
  } catch {
    return false;
  }
}

// Express middleware
async function creditGate(req: Request, res: Response, next: Function) {
  const customerId = req.headers['x-customer-id'] as string;
  const hasCredits = await requireCredits(customerId, 'cent_api_credits');

  if (!hasCredits) {
    return res.status(402).json({
      error: 'Insufficient credits',
      message: 'Your credit balance is exhausted. Please upgrade your plan or purchase more credits.',
    });
  }

  next();
}
```

### Promotional Credit Grants

```typescript
// Grant promotional credits with idempotency
async function grantPromoCredits(
  customerId: string,
  creditId: string,
  amount: number,
  promoCode: string
) {
  await client.creditEntitlements.balances.createLedgerEntry(
    creditId,
    customerId,
    {
      type: 'credit',
      amount: amount.toString(),
      description: `Promotional credit: ${promoCode}`,
      idempotency_key: `promo_${promoCode}_${customerId}`, // Prevents double-granting
    }
  );
}
```

---

## Real-World Pricing Examples

### AI SaaS Platform

```
Plan      | Price    | Credits/Month  | Overage
----------|----------|----------------|----------
Starter   | $29/mo   | 10,000 tokens  | $0.003/token
Pro       | $99/mo   | 100,000 tokens | $0.002/token
Enterprise| $499/mo  | 1,000,000 tokens| $0.001/token

Credit Config:
  Type: Custom Unit ("AI Tokens"), Precision: 0
  Rollover: 25% max, 1-month timeframe
  Overage: Bill overage at billing
  Meter: ai.generation (Sum on tokens)
```

### API Gateway

```
Plan      | Price    | Credits/Month  | Overage
----------|----------|----------------|----------
Free      | $0/mo    | 1,000 calls    | Blocked
Developer | $19/mo   | 50,000 calls   | $0.001/call
Business  | $99/mo   | 500,000 calls  | $0.0005/call

Credit Config:
  Type: Custom Unit ("API Calls"), Precision: 0
  Rollover: Disabled
  Overage: Free=disabled, Dev+=forgive at reset
  Meter: api.request (Count)
```

### Cloud Storage

```
Plan      | Price    | Credits/Month  | Overage
----------|----------|----------------|----------
Personal  | $9/mo    | 100 GB-hours   | $0.05/GB-hour
Team      | $49/mo   | 1,000 GB-hours | $0.03/GB-hour

Credit Config:
  Type: Custom Unit ("GB-hours"), Precision: 2
  Rollover: 50% max, carries over once
  Overage: Enabled with 200% limit
  Meter: storage.usage (Sum)
```

---

## Credit Ledger

Every credit operation is recorded with full audit trail:

| Transaction Type | Description |
|-----------------|-------------|
| **Credit Added** | Credits granted (subscription, one-time, or API) |
| **Credit Deducted** | Credits consumed through usage or manual debit |
| **Credit Expired** | Credits expired without rollover |
| **Credit Rolled Over** | Credits carried forward to the next period |
| **Rollover Forfeited** | Rolled credits forfeited after max count reached |
| **Overage Charged** | Usage beyond credit balance with overage enabled |
| **Auto Top-Up** | Automatic credit replenishment at low balance |
| **Manual Adjustment** | Credit or debit applied manually by merchant |
| **Refund** | Credits refunded |

Each ledger entry records balance before/after, overage before/after, description, and reference to the source.

---

## Best Practices

### 1. Start Simple
Begin with a single credit type and no rollover. Add complexity based on customer usage patterns.

### 2. Use Meaningful Units
Name credits after what they represent ("API Calls", "AI Tokens") not generic terms.

### 3. Set Low Balance Thresholds
Configure thresholds and subscribe to `credit.balance_low` to alert customers before they run out.

### 4. Use Idempotency Keys
Always include idempotency keys for manual ledger entries to prevent double-granting:
```typescript
idempotency_key: `promo_${promoCode}_${customerId}`
```

### 5. Configure Expiry Thoughtfully
Short expiry (7 days) drives urgency but may frustrate. 30–90 days is customer-friendly for most SaaS.

### 6. Test the Full Cycle
In test mode: create credits → attach to product → purchase → send usage events → verify deduction → test expiration and rollover.

### 7. Monitor Overage
If using "Bill overage at billing", monitor overage amounts to avoid unexpected charges for customers.

---

## Resources

- [Credit-Based Billing Guide](https://docs.dodopayments.com/features/credit-based-billing)
- [Credit Entitlements API](https://docs.dodopayments.com/api-reference/credit-entitlements/create-credit-entitlement)
- [Credit Webhook Events](https://docs.dodopayments.com/developer-resources/webhooks/intents/credit)
- [Usage-Based Billing](https://docs.dodopayments.com/features/usage-based-billing/introduction)
- [Subscription Integration](https://docs.dodopayments.com/developer-resources/subscription-integration-guide)
