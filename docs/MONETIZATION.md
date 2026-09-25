# Monetization

Nirvana stays free. It earns money in three ways that don't need a bank account, Stripe or PayPal, so they also work for developers in Iran. Every one is off until you set its environment variable.

| Method | Paid in | Needs | Allowed on Vercel Hobby? |
| --- | --- | --- | --- |
| Telegram Stars donations (`/donate` in the bot, button in the app) | Stars → TON via Fragment | The bot (already set up) | ✅ donations are not commercial use |
| Crypto donations with automatic TRC20 verification | USDT (TRC20 / TON / BEP20), TON | Your wallet addresses | ✅ |
| A-ADS banner for non-supporters | Bitcoin | An A-ADS ad unit | ❌ needs Render (free) or Vercel Pro |

Everyone who donates gets a 💎 supporter badge, and supporters never see the ad.

## 1. Telegram Stars

Nothing to configure: the bot answers `/donate`, and the app's 💚 button opens `t.me/<bot>?start=donate`. The payment uses Telegram's built-in `XTR` currency, so no payment provider token is needed. After a payment the bot records the donation and turns on the badge.

- Choose the amounts with `DONATE_STARS_AMOUNTS=50,150,500`, or turn Stars off with `DONATE_STARS=off`.
- To cash out, open your bot's profile in Telegram → Balance and withdraw to TON through [Fragment](https://fragment.com). Stars become withdrawable 21 days after you receive them, with a minimum of 1,000 Stars. Sell the TON for USDT on any exchange.

## 2. Crypto wallets

```env
DONATE_USDT_TRC20=T...        # Tron address: USDT here is verified automatically
DONATE_TON=UQ...              # TON address (TON and USDT on TON)
DONATE_USDT_BEP20=0x...       # BNB Chain address
SUPPORTER_MIN_USDT=2          # minimum TRC20 donation that grants the badge
TRONGRID_API_KEY=             # optional: raises TronGrid's rate limit
```

The support dialog shows each address with a QR code, a copy button and a warning to use the right network. After sending USDT on TRC20, the donor pastes the transaction ID (TxID). `/api/support` then checks the transaction on TronGrid's confirmed (`walletsolidity`) endpoint. The transaction must have succeeded, carry a USDT `Transfer` to your address, and meet the minimum. Each TxID can be claimed only once, by one account.

Addresses that fail validation (a bad Tron checksum, or a malformed `0x` address) are silently left out of the dialog, so a typo never shows the wrong address.

## 3. Ads (A-ADS)

[A-ADS](https://aads.com) is a crypto ad network with no KYC. It pays in Bitcoin, and anyone can join.

1. Create an **Adaptive** ad unit for your domain and copy its numeric id.
2. Set `ADS_AADS_UNIT=<id>`.

A banner then appears under the task list for users who haven't donated, with a "remove ads by supporting 💎" link. The iframe URL is built in `renderAd()` in `index.html`. If A-ADS gives you a different embed code, change that one line.

> **Vercel's Hobby (free) plan does not allow ads.** Only set `ADS_AADS_UNIT` on a host that permits them: [Render's free plan](DEPLOYMENT.md#alternative-render-free-ads-allowed) or Vercel Pro.

## Other ideas

- **Iranian users paying in rials**: an IDPay or Zarinpal gateway could sell the same supporter badge. It pays into an Iranian bank account, not dollars.
- **Telegram channel ads**: once the bot has a channel with 1,000+ subscribers, Telegram shares ad revenue with the channel in TON.
