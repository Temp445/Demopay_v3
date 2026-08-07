import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const respond = (data: object, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { action } = body

    const keyId = Deno.env.get('RAZORPAY_KEY_ID')
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!keyId || !keySecret) {
      return respond({ error: 'Razorpay keys not configured. Run: supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...' }, 500)
    }

    // ── CREATE ORDER ──────────────────────────────────────────────────────────
    if (action === 'create_order') {
      const { amount, plan, billing } = body

      if (!amount || amount <= 0) return respond({ error: 'Invalid amount provided.' }, 400)

      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(`${keyId}:${keySecret}`)}`
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency: 'INR',
          receipt: `rcpt_${Date.now()}`,
          notes: { plan: plan || 'Unknown', billing: billing || 'monthly' }
        })
      })

      const order = await rzpRes.json()
      if (!rzpRes.ok) return respond({ error: order.error?.description || 'Razorpay order creation failed.' }, 400)

      return respond(order)
    }

    // ── CHECK SUBSCRIPTION ────────────────────────────────────────────────────
    if (action === 'check_subscription') {
      const { email } = body
      if (!email) return respond({ subscribed: false })

      if (!supabaseUrl || !supabaseServiceKey) {
        return respond({ subscribed: false, error: 'Supabase not configured.' })
      }

      const db = createClient(supabaseUrl, supabaseServiceKey)
      const { data, error } = await db
        .from('subscriptions')
        .select('plan_name, billing_cycle, status, created_at, expires_at')
        .eq('email', email.toLowerCase().trim())
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) return respond({ subscribed: false })
      if (!data) return respond({ subscribed: false })

      return respond({ subscribed: true, subscription: data })
    }

    // ── VERIFY PAYMENT ────────────────────────────────────────────────────────
    if (action === 'verify_payment') {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature,
              email, name, company, mobile_number, plan, billing, amount_paise, tenant_id,
              data_handling } = body

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return respond({ error: 'Missing payment verification fields.' }, 400)
      }

      // Verify HMAC signature
      const text = `${razorpay_order_id}|${razorpay_payment_id}`
      const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(keySecret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      )
      const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))
      const expectedSig = Array.from(new Uint8Array(sigBytes))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      if (expectedSig !== razorpay_signature) {
        return respond({ error: 'Payment signature mismatch. Verification failed.' }, 400)
      }

      // ── Save subscription record ──────────────────────────────────────────
      if (supabaseUrl && supabaseServiceKey && email && tenant_id) {
        const db = createClient(supabaseUrl, supabaseServiceKey)

        // Calculate expiry: annual = 365 days, monthly = 30 days
        const isAnnual = billing === 'annual'
        const now = new Date()
        let baseDate = new Date()
        let extraMs = 0
        
        // Check for existing active subscription
        const { data: latestSub } = await db
          .from('subscriptions')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('status', 'active')
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestSub && new Date(latestSub.expires_at) > now) {
          if (latestSub.plan_name === (plan || 'Unknown')) {
            // Extension: Start from the existing expiration date
            baseDate = new Date(latestSub.expires_at)
          } else {
            // Upgrade/Switch: Start from now, but add prorated extra time from remaining balance
            const expiry = new Date(latestSub.expires_at)
            const created = new Date(latestSub.created_at)
            
            const totalDuration = expiry.getTime() - created.getTime()
            const remainingDuration = expiry.getTime() - now.getTime()
            
            if (totalDuration > 0 && remainingDuration > 0) {
              const remainingFraction = remainingDuration / totalDuration
              
              // Normalize existing amount to PAISE (now stored as decimal Rupees)
              let existingPaise = (latestSub.amount_paid || 0) * 100
              
              const creditAmountPaise = existingPaise * remainingFraction
              
              // Calculate value of 1ms on the NEW plan (amount_paise is from request in PAISE)
              const newPeriodMs = (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000
              const pricePerMs = (amount_paise || 1) / newPeriodMs
              
              extraMs = creditAmountPaise / pricePerMs
            }
            baseDate = now
          }
        }

        const expiresAt = new Date(baseDate.getTime() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000 + extraMs)

        // ── Generate Invoice Number ──────────────────────────────────────────
        const year = new Date().getFullYear()
        const { count } = await db
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
        
        const invoiceNumber = `ACE/${year}/${String((count || 0) + 1).padStart(4, '0')}`

        // Fetch GST number from company_settings to save in subscription record
        const { data: settings } = await db
          .from('company_settings')
          .select('gst_number')
          .eq('tenant_id', tenant_id)
          .maybeSingle()

        const { error: insertError } = await db.from('subscriptions').insert({
          tenant_id,
          email: email.toLowerCase().trim(),
          name: name || null,
          company: company || null,
          mobile_number: mobile_number || null,
          plan_name: plan || 'Unknown',
          billing_cycle: billing || 'monthly',
          amount_paid: (amount_paise || 0) / 100.0, // Store in Rupees (decimal)
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          status: 'active',
          expires_at: expiresAt.toISOString(),
          gst_number: settings?.gst_number || null,
          invoice_number: invoiceNumber
        })

        if (insertError) {
          console.error('[razorpay] Subscription insert error:', insertError)
          return respond({ error: `Failed to save subscription: ${insertError.message}` }, 500)
        }

        // ── Start Fresh: wipe all operational data for this tenant ────────────
        if (data_handling === 'fresh') {
          const { error: clearError } = await db.rpc('clear_tenant_data', { p_tenant_id: tenant_id })
          if (clearError) {
            // Subscription is already created; log the error but don't fail the payment.
            console.error('[razorpay] clear_tenant_data error:', clearError.message)
          }
        }
      }

      return respond({ status: 'success', message: 'Payment verified and subscription activated.' })
    }

    return respond({ error: `Unknown action: "${action}"` }, 400)

  } catch (err) {
    return respond({ error: err.message || 'Internal server error.' }, 500)
  }
})
