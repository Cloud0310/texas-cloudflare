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

  function startingAmount(): number {
    return minimum;
  }

  let amountPanel: HTMLDialogElement;
  let amountInput: HTMLInputElement;
  let sliderValue = $state(0);
  let selectedAmount = $state(startingAmount());
  let valid = $state(true);
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
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    amountPanel.showModal();
    amountInput.focus();
    return () => {
      if (amountPanel.open) amountPanel.close();
      opener?.focus();
    };
  });

  function amountIsValid(amount: number): boolean {
    return Number.isSafeInteger(amount) && amount >= minimum && amount <= maximum;
  }

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
    const next = clampAmount(amount, minimum, maximum);
    amountInput.value = String(next);
    sliderValue = sliderPositionFor(next);
    selectedAmount = next;
    valid = true;
  }

  function handleNumberInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const next = event.currentTarget.valueAsNumber;
    valid = amountIsValid(next);
    if (valid) {
      sliderValue = sliderPositionFor(next);
      selectedAmount = next;
    }
  }

  function confirm(): void {
    const amount = amountInput.valueAsNumber;
    valid = amountIsValid(amount);
    if (valid) onconfirm(amount);
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    oncancel();
  }

  function handleBackdropClick(event: MouseEvent): void {
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
    <span>{title}</span>
    <input
      bind:this={amountInput}
      aria-label={title}
      type="number"
      min={minimum}
      max={maximum}
      step="5"
      defaultValue={minimum}
      aria-invalid={!valid}
      oninput={handleNumberInput}
      onkeydown={(event) => event.key === "Enter" && confirm()}
    />
  </div>

  <div class="amount-tuning">
    <div class="range-label">
      <span>Minimum {minimum}</span><strong>Drag to adjust</strong><span>Maximum {maximum}</span>
    </div>
    <input
      aria-label="Amount slider"
      aria-valuetext={`${selectedAmount} chips`}
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
    {#if !valid}<span class="invalid-amount">Use a whole number between {minimum} and {maximum}.</span>{/if}
  </div>

  <div class="amount-actions">
    <button class="ghost close-amount" type="button" onclick={oncancel} aria-label="Cancel">×</button>
    <button type="button" disabled={!valid} onclick={confirm}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  .amount-panel::backdrop {
    background: rgba(3, 8, 6, 0.52);
    backdrop-filter: blur(2px);
  }

  .amount-panel {
    position: fixed;
    inset-block-start: auto;
    inset-block-end: calc(var(--gap) + 4.8rem);
    inset-inline-start: 50%;
    inset-inline-end: auto;
    display: grid;
    grid-template-columns: 140px minmax(280px, 1fr) auto;
    align-items: stretch;
    gap: 0;
    inline-size: min(920px, calc(100vw - 2rem));
    margin: 0;
    max-block-size: calc(100dvh - 7rem);
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
    gap: 0.2rem;
    padding: 0.8rem 1rem;
    background: rgba(229, 185, 90, 0.1);
  }

  .amount-block span {
    color: var(--ink-dim);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .amount-block input {
    min-block-size: 0;
    border: 0;
    border-radius: 0;
    padding: 0;
    color: #f2d189;
    background: transparent;
    font-size: 2rem;
    font-weight: 850;
    font-variant-numeric: tabular-nums;
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
    font-size: 0.65rem;
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
    min-block-size: 32px;
    border-color: var(--line);
    padding: 0.3rem 0.55rem;
    color: var(--ink);
    background: var(--panel-2);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .invalid-amount {
    color: #ff9c9c;
    font-size: 0.68rem;
  }

  .amount-actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border-inline-start: 1px solid var(--line);
    padding: 0.7rem;
  }

  .amount-actions button {
    min-block-size: 38px;
    padding: 0.4rem 0.85rem;
    white-space: nowrap;
  }

  .amount-actions .close-amount {
    inline-size: 38px;
    padding: 0;
    font-size: 1.2rem;
  }

  @media (max-width: 760px) {
    .amount-panel {
      inset-block-end: calc(var(--gap) + 7.8rem);
      grid-template-columns: 112px 1fr;
      max-block-size: calc(100dvh - 10rem);
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
      align-items: center;
      padding-block: 0.55rem;
    }

    .amount-block input {
      inline-size: 7rem;
      text-align: center;
    }

    .quick-amounts {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }

    .amount-actions {
      grid-column: auto;
    }
  }
</style>
