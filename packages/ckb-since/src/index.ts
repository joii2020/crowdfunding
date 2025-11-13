type Ordering = -1 | 0 | 1;

type LockValue =
  | { kind: "BlockNumber"; value: bigint }
  | { kind: "EpochNumberWithFraction"; value: EpochNumberWithFraction }
  | { kind: "Timestamp"; value: bigint };

export class Since {
  public raw: bigint;

  static readonly LOCK_TYPE_FLAG = 1n << 63n;
  static readonly METRIC_TYPE_FLAG_MASK = 0x6000_0000_0000_0000n;
  static readonly FLAGS_MASK = 0xff00_0000_0000_0000n;
  static readonly VALUE_MASK = 0x00ff_ffff_ffff_ffffn;
  static readonly REMAIN_FLAGS_BITS = 0x1f00_0000_0000_0000n;
  static readonly LOCK_BY_BLOCK_NUMBER_MASK = 0x0000_0000_0000_0000n;
  static readonly LOCK_BY_EPOCH_MASK = 0x2000_0000_0000_0000n;
  static readonly LOCK_BY_TIMESTAMP_MASK = 0x4000_0000_0000_0000n;

  constructor(v: bigint | undefined) {
    this.raw = v ? v : BigInt(0);
  }

  static fromBlockNumber(n: bigint, absolute: boolean): Since | null {
    if ((n & this.FLAGS_MASK) !== 0n) return null;
    const v =
      n |
      this.LOCK_BY_BLOCK_NUMBER_MASK |
      (absolute ? 0n : this.LOCK_TYPE_FLAG);
    return new Since(v);
  }

  static fromTimestamp(ts: bigint, absolute: boolean): Since | null {
    if ((ts & this.FLAGS_MASK) !== 0n) return null;
    const v =
      ts | this.LOCK_BY_TIMESTAMP_MASK | (absolute ? 0n : this.LOCK_TYPE_FLAG);
    return new Since(v);
  }

  static fromEpoch(epoch: EpochNumberWithFraction, absolute: boolean): Since {
    const e = epoch.full;
    const v =
      e | this.LOCK_BY_EPOCH_MASK | (absolute ? 0n : this.LOCK_TYPE_FLAG);
    return new Since(v);
  }

  extractLockValue(): LockValue | undefined {
    const value = this.raw & Since.VALUE_MASK;
    const metric = this.raw & Since.METRIC_TYPE_FLAG_MASK;

    if (metric === Since.LOCK_BY_BLOCK_NUMBER_MASK) {
      return { kind: "BlockNumber", value };
    }
    if (metric === Since.LOCK_BY_EPOCH_MASK) {
      return {
        kind: "EpochNumberWithFraction",
        value: EpochNumberWithFraction.fromFullValue(value),
      };
    }
    if (metric === Since.LOCK_BY_TIMESTAMP_MASK) {
      return { kind: "Timestamp", value: value * 1000n }; // ms
    }
    return undefined;
  }

  isAbsolute(): boolean {
    return (this.raw & Since.LOCK_TYPE_FLAG) === 0n;
  }

  cmp(other: Since): Ordering | null {
    if (this.isAbsolute() != other.isAbsolute()) {
      return null;
    }

    let a = this.extractLockValue();
    let b = other.extractLockValue();
    if (a == undefined || b == undefined) {
      return null;
    }

    if (a.kind != b.kind) {
      return null;
    }

    switch (a.kind) {
      case "BlockNumber":
      case "Timestamp":
        if (a.value < (b as typeof a).value) return -1;
        else if (a.value > (b as typeof a).value) return 1;
        else return 0;
      case "EpochNumberWithFraction":
        return a.value.cmp((b as typeof a).value);
    }
    return null;
  }
  eq(other: Since): boolean {
    return this.cmp(other) === 0;
  }
  lt(other: Since): boolean {
    return this.cmp(other) === -1;
  }
  le(other: Since): boolean {
    let v = this.cmp(other);
    return v === -1 || v === 0;
  }
  gt(other: Since): boolean {
    return this.cmp(other) === 1;
  }
  ge(other: Since): boolean {
    let v = this.cmp(other);
    return v === 1 || v === 0;
  }
}

export class EpochNumberWithFraction {
  constructor(public readonly full: bigint) {}

  static readonly NUMBER_OFFSET = 0n;
  static readonly NUMBER_BITS = 24n;
  static readonly NUMBER_MAXIMUM_VALUE =
    1n << EpochNumberWithFraction.NUMBER_BITS;
  static readonly NUMBER_MASK =
    EpochNumberWithFraction.NUMBER_MAXIMUM_VALUE - 1n;
  static readonly INDEX_OFFSET = EpochNumberWithFraction.NUMBER_BITS;
  static readonly INDEX_BITS = 16n;
  static readonly INDEX_MAXIMUM_VALUE =
    1n << EpochNumberWithFraction.INDEX_BITS;
  static readonly INDEX_MASK = EpochNumberWithFraction.INDEX_MAXIMUM_VALUE - 1n;
  static readonly LENGTH_OFFSET =
    EpochNumberWithFraction.NUMBER_BITS + EpochNumberWithFraction.INDEX_BITS;
  static readonly LENGTH_BITS = 16n;
  static readonly LENGTH_MAXIMUM_VALUE =
    1n << EpochNumberWithFraction.LENGTH_BITS;
  static readonly LENGTH_MASK =
    EpochNumberWithFraction.LENGTH_MAXIMUM_VALUE - 1n;

  static fromFullValue(value: bigint): EpochNumberWithFraction {
    const e = new EpochNumberWithFraction(value);
    if (e.length() === 0n) {
      const fixed =
        (1n << EpochNumberWithFraction.LENGTH_OFFSET) |
        (e.number() << EpochNumberWithFraction.NUMBER_OFFSET);
      return new EpochNumberWithFraction(fixed);
    }
    return e;
  }

  static new_unchecked(
    number: bigint,
    index: bigint,
    length: bigint,
  ): EpochNumberWithFraction {
    return new EpochNumberWithFraction(
      (length << EpochNumberWithFraction.LENGTH_OFFSET) |
        (index << EpochNumberWithFraction.INDEX_OFFSET) |
        (number << EpochNumberWithFraction.NUMBER_OFFSET),
    );
  }

  static create(
    number: bigint,
    index: bigint,
    length: bigint,
  ): EpochNumberWithFraction | null {
    if (
      number < EpochNumberWithFraction.NUMBER_MAXIMUM_VALUE &&
      index < EpochNumberWithFraction.INDEX_MAXIMUM_VALUE &&
      length < EpochNumberWithFraction.LENGTH_MAXIMUM_VALUE &&
      length > 0 &&
      index < length
    ) {
      return EpochNumberWithFraction.new_unchecked(number, index, length);
    } else {
      return null;
    }
  }

  number(): bigint {
    return (
      (this.full >> EpochNumberWithFraction.NUMBER_OFFSET) &
      EpochNumberWithFraction.NUMBER_MASK
    );
  }
  index(): bigint {
    return (
      (this.full >> EpochNumberWithFraction.INDEX_OFFSET) &
      EpochNumberWithFraction.INDEX_MASK
    );
  }
  length(): bigint {
    return (
      (this.full >> EpochNumberWithFraction.LENGTH_OFFSET) &
      EpochNumberWithFraction.LENGTH_MASK
    );
  }

  cmp(other: EpochNumberWithFraction): Ordering | null {
    const aNum = this.number();
    const bNum = other.number();
    if (aNum < bNum) return -1;
    else if (aNum > bNum) return 1;

    let aBlock = this.index() * other.length();
    let bBlock = other.index() * this.length();

    if (aBlock < bBlock) return -1;
    else if (aBlock > bBlock) return 1;
    else return 0;
  }

  eq(other: EpochNumberWithFraction): boolean {
    return this.cmp(other) === 0;
  }
  lt(other: EpochNumberWithFraction): boolean {
    return this.cmp(other) === -1;
  }
  le(other: EpochNumberWithFraction): boolean {
    let v = this.cmp(other);
    return v === -1 || v === 0;
  }
  gt(other: EpochNumberWithFraction): boolean {
    return this.cmp(other) === 1;
  }
  ge(other: EpochNumberWithFraction): boolean {
    let v = this.cmp(other);
    return v === 1 || v === 0;
  }

  add(rhs: EpochNumberWithFraction): EpochNumberWithFraction | null {
    const U64_MAX = (1n << 64n) - 1n;
    const toBig = (x: number | bigint) =>
      typeof x === "bigint" ? x : BigInt(x);
    const gcdBig = (a: bigint, b: bigint): bigint => {
      a = a < 0n ? -a : a;
      b = b < 0n ? -b : b;
      while (b !== 0n) {
        const t = a % b;
        a = b;
        b = t;
      }
      return a;
    };

    const aNum = toBig(this.number());
    const bNum = toBig(rhs.number());
    const aIdx = toBig(this.index());
    const bIdx = toBig(rhs.index());
    const aLen = toBig(this.length());
    const bLen = toBig(rhs.length());

    let number = aNum + bNum;
    if (number < 0n || number > U64_MAX) return null;

    let numerator = aIdx * bLen + bIdx * aLen;
    let denominator = aLen * bLen;
    if (denominator === 0n) return null;

    const d = gcdBig(numerator, denominator);
    numerator /= d;
    denominator /= d;
    const fullEpochs = numerator / denominator;
    number += fullEpochs;
    if (number < 0n || number > U64_MAX) return null;

    numerator %= denominator;

    if (numerator < 0n || numerator > U64_MAX) return null;
    if (denominator < 1n || denominator > U64_MAX) return null;

    const out = EpochNumberWithFraction.create(number, numerator, denominator);
    if (!out) return null;
    return out;
  }
}
