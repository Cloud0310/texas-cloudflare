<script lang="ts">
  import { clampAmount } from "@texas/shared";
  import { onMount } from "svelte";

  type AmountAction = "bet" | "raise";

  const SLIDER_STEPS = 1_000;
  const CHIP_STEP = 5;

  let {
    action,
    minimum,
    maximum,
    pot,
    currentBet,
    onconfirm,
    oncancel
  }: {
    action: AmountAction;
    minimum: number;
    maximum: number;
    pot: number;
    currentBet: number;
    onconfirm: (amount: number) => void;
    oncancel: () => void;
  } = $props();

  let amountPanel: HTMLDialogElement;
  let selectedAmount = $state<number | undefined>();
  let valid = $derived(
    selectedAmount !== undefined && Number.isSafeInteger(selectedAmount) &&
    selectedAmount >= minimum && selectedAmount <= maximum
  );
  let sliderValue = $derived(sliderPositionFor(valid ? (selectedAmount ?? minimum) : minimum));
  let title = $derived(action === "raise" ? "Raise to" : "Bet amount");
  let confirmLabel = $derived(action === "raise" ? "Confirm raise" : "Place bet");
  let quickAmounts = $derived.by(() => {
    const offset = action === "raise" ? currentBet : 0;
    return [
      { label: "1/3 pot", value: clampAmount(offset + Math.ceil(pot / 3), minimum, maximum) },
      { label: "1/2 pot", value: clampAmount(offset + Math.ceil(pot / 2), minimum, maximum) },
      { label: "1 pot", value: clampAmount(offset + pot, minimum, maximum) },
      { label: "All in", value: maximum },
    ];
  });

  onMount(() => {
    selectedAmount = minimum;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    amountPanel.showModal();
    return () => {
      if (amountPanel.open) amountPanel.close();
      opener?.focus();
    };
  });

  function sliderPositionFor(amount: number): number {
    if (maximum <= minimum) return 0;
    const progress = Math.log(amount / minimum) / Math.log(maximum / minimum);
    return Math.round(clampAmount(progress, 0, 1) * SLIDER_STEPS);
  }

  function amountForSlider(position: number): number {
    if (position <= 0 || maximum <= minimum) return minimum;
    if (position >= SLIDER_STEPS) return maximum;
    const progress = position / SLIDER_STEPS;
    const amount = minimum * Math.pow(maximum / minimum, progress);
    return clampAmount(Math.round(amount / CHIP_STEP) * CHIP_STEP, minimum, maximum);
  }

  function setAmount(amount: number): void {
    selectedAmount = clampAmount(amount, minimum, maximum);
  }

  function confirm(): void {
    if (valid && selectedAmount !== undefined) onconfirm(selectedAmount);
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    oncancel();
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target !== amountPanel) return;
    const bounds = amountPanel.getBoundingClientRect();
    const inside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    if (!inside) oncancel();
  }
</script>

<dialog
  bind:this={amountPanel}
  id="amount-panel"
  aria-label={title}
  class="amount-panel"
  oncancel={handleCancel}
  onclick={handleBackdropClick}
>
  <div class="amount-block">
    <label for="manual-amount">{title} <span>(chips)</span></label>
    <input
      bind:value={selectedAmount}
      id="manual-amount"
      name="amount"
      type="number"
      inputmode="numeric"
      enterkeyhint="done"
      required
      min={minimum}
      max={maximum}
      step="1"
      placeholder="Enter amount"
      aria-invalid={!valid}
      aria-describedby={valid ? "amount-help" : "amount-help amount-error"}
      onkeydown={(event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          confirm();
        }
      }}
    />
    <small id="amount-help">{action === "raise"
      ? "Type the total bet, including chips already bet."
      : "Type an amount or use the slider."}</small>
  </div>

  <div class="amount-tuning">
    <div class="range-label">
      <span>Minimum {minimum}</span><strong>Drag to adjust</strong><span>Maximum {maximum}</span>
    </div>
    <input
      aria-label="Amount slider"
      aria-valuetext={valid ? `${selectedAmount} chips` : "Enter a valid amount"}
      type="range"
      min="0"
      max={SLIDER_STEPS}
      step="1"
      value={sliderValue}
      oninput={(event) => setAmount(amountForSlider(event.currentTarget.valueAsNumber))}
    />
    <div aria-label="Quick amounts" class="quick-amounts">
      {#each quickAmounts as quick}
        <button type="button" onclick={() => setAmount(quick.value)}>{quick.label}</button>
      {/each}
    </div>
    {#if !valid}<span id="amount-error" class="invalid-amount" role="status">Use a whole number between {minimum} and {maximum}.</span>{/if}
  </div>

  <div class="amount-actions">
    <!-- svelte-ignore a11y_autofocus (The modal starts on a non-editable control so opening it does not summon the mobile keyboard.) -->
    <button class="ghost close-amount" type="button" autofocus onclick={oncancel} aria-label="Cancel">×</button>
    <button type="button" disabled={!valid} onclick={confirm}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  .amount-panel::backdrop {
    background: rgba(3, 8, 6, 0.52);
    backdrop-filter: blur(2px);
  }

  .amount-panel {
    --amount-bottom: calc(96px + env(safe-area-inset-bottom));
    position: fixed;
    inset-block-start: auto;
    inset-block-end: var(--amount-bottom);
    inset-inline-start: 50%;
    inset-inline-end: auto;
    display: grid;
    grid-template-columns: 200px minmax(280px, 1fr) auto;
    align-items: stretch;
    gap: 0;
    inline-size: min(920px, calc(100vw - 2rem));
    margin: 0;
    max-block-size: calc(100dvh - var(--amount-bottom) - 16px - env(safe-area-inset-top));
    overflow: auto;
    border: 1px solid rgba(229, 185, 90, 0.28);
    border-radius: 16px;
    padding: 0;
    color: var(--ink);
    background: #111713;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.62);
    transform: translateX(-50%);
  }

  .amount-block {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5rem;
    min-inline-size: 0;
    padding: 0.8rem 1rem;
    background: rgba(229, 185, 90, 0.1);
  }

  .amount-block label {
    color: var(--ink-dim);
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .amount-block label span {
    font-weight: 500;
    text-transform: none;
  }

  .amount-block input {
    min-inline-size: 0;
    min-block-size: 52px;
    border: 1px solid var(--gold-line);
    border-radius: 10px;
    padding: 0.5rem 0.65rem;
    color: #f2d189;
    background: #070b09;
    font-size: 1.75rem;
    font-weight: 850;
    font-variant-numeric: tabular-nums;
  }

  .amount-block input[aria-invalid="true"] {
    border-color: #ff9c9c;
  }

  .amount-block small {
    color: var(--ink-dim);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .amount-tuning {
    display: grid;
    gap: 0.45rem;
    padding: 0.75rem 1rem;
  }

  .range-label {
    display: flex;
    justify-content: space-between;
    color: rgba(236, 232, 219, 0.5);
    font-size: 0.8rem;
  }

  .range-label strong {
    color: rgba(236, 232, 219, 0.75);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .amount-tuning > input {
    inline-size: 100%;
    min-block-size: 1.25rem;
    border: 0;
    padding: 0;
    background: transparent;
    accent-color: var(--gold);
  }

  .quick-amounts {
    display: flex;
    gap: 0.35rem;
  }

  .quick-amounts button {
    flex: 1;
    min-block-size: 44px;
    border-color: var(--line);
    padding: 0.3rem 0.55rem;
    color: var(--ink);
    background: var(--panel-2);
    font-size: 0.875rem;
    white-space: nowrap;
  }

  .invalid-amount {
    color: #ff9c9c;
    font-size: 0.8rem;
  }

  .amount-actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border-inline-start: 1px solid var(--line);
    padding: 0.7rem;
  }

  .amount-actions button {
    min-block-size: 44px;
    padding: 0.4rem 0.85rem;
    white-space: nowrap;
  }

  .amount-actions .close-amount {
    inline-size: 44px;
    padding: 0;
    font-size: 1.2rem;
  }

  @media (max-width: 760px) {
    .amount-panel {
      grid-template-columns: 180px minmax(0, 1fr);
    }

    .amount-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
      border-block-start: 1px solid var(--line);
      border-inline-start: 0;
    }
  }

  @media (max-width: 520px) {
    .amount-panel {
      grid-template-columns: 1fr;
    }

    .amount-block {
      padding-block: 0.55rem;
    }

    .quick-amounts {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }

    .amount-actions {
      grid-column: auto;
    }
  }

  @media (max-height: 500px) {
    .amount-panel { --amount-bottom: calc(64px + env(safe-area-inset-bottom)); }
  }
</style>
