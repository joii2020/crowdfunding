import { Since, EpochNumberWithFraction } from ".";

function assert(v: boolean) {
  expect(v).toBe(true);
}
function assert_eq<T extends { eq(other: any): boolean }>(
  a: T | null,
  b: T | bigint,
) {
  expect(a?.eq(b instanceof Object ? b : new (a!.constructor as any)(b))).toBe(
    true,
  );
}
function assert_null<T>(a: T | null) {
  expect(a).toBe(null);
}

describe("unit test", () => {
  test("success", () => {
    assert_eq(Since.fromBlockNumber(0x12300n, true), 0x12300n);
    assert_eq(Since.fromBlockNumber(0x12300n, false), 0x8000_0000_0001_2300n);
    assert_null(Since.fromBlockNumber(0x1100_0000_0000_2300n, true));

    assert_eq(Since.fromTimestamp(0xffaa_1122n, true), 0x4000_0000_ffaa_1122n);
    assert_eq(Since.fromTimestamp(0xffaa_1122n, false), 0xc000_0000_ffaa_1122n);
    assert_null(Since.fromTimestamp(0x0100_0000_ffaa_1122n, false));

    assert_eq(
      Since.fromEpoch(EpochNumberWithFraction.fromFullValue(1n), true),
      0x2000_0100_0000_0001n,
    );
    assert_eq(
      Since.fromEpoch(EpochNumberWithFraction.fromFullValue(1n), false),
      0xa000_0100_0000_0001n,
    );
    assert_null(EpochNumberWithFraction.create(16777216n, 1n, 1000n));
    assert_null(EpochNumberWithFraction.create(10000n, 0n, 0n));
    assert_null(EpochNumberWithFraction.create(10000n, 0n, 65536n));
    assert_null(EpochNumberWithFraction.create(10000n, 65536n, 65536n));
    assert_null(EpochNumberWithFraction.create(10000n, 1000n, 1000n));
    assert_null(EpochNumberWithFraction.create(10000n, 1001n, 1000n));

    assert_eq(
      EpochNumberWithFraction.create(16777215n, 65534n, 65535n),
      0xff_ffff_feff_ffffn,
    );

    // add
    assert_eq(
      EpochNumberWithFraction.create(1000n, 1n, 7n)?.add(
        EpochNumberWithFraction.create(2000n, 1n, 5n)!,
      )!,
      EpochNumberWithFraction.create(3000n, 12n, 35n)!,
    );
    assert_eq(
      EpochNumberWithFraction.create(100n, 7n, 13n)?.add(
        EpochNumberWithFraction.create(50n, 3n, 5n)!,
      )!,
      EpochNumberWithFraction.create(151n, 9n, 65n)!,
    );
    assert_eq(
      EpochNumberWithFraction.create(30n, 3n, 8n)?.add(
        EpochNumberWithFraction.create(500n, 5n, 6n)!,
      )!,
      EpochNumberWithFraction.create(531n, 5n, 24n)!,
    );
    assert_null(
      EpochNumberWithFraction.create(1000n, 1n, 1001n)?.add(
        EpochNumberWithFraction.create(2000n, 7n, 1003n)!,
      ),
    );

    assert(
      Since.fromBlockNumber(1234n, true)!.lt(
        Since.fromBlockNumber(2000n, true)!,
      ),
    );
    assert(
      Since.fromBlockNumber(2001n, false)!.gt(
        Since.fromBlockNumber(2000n, false)!,
      ),
    );
    assert(
      Since.fromTimestamp(3111n, true)!.gt(Since.fromTimestamp(2000n, true)!),
    );
    assert(
      Since.fromTimestamp(1999n, false)!.lt(Since.fromTimestamp(2000n, false)!),
    );

    assert(
      Since.fromEpoch(
        EpochNumberWithFraction.create(100n, 999n, 1000n)!,
        true,
      )!.lt(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ),
    );
    assert(
      Since.fromEpoch(
        EpochNumberWithFraction.create(100n, 600n, 1000n)!,
        true,
      )!.lt(
        Since.fromEpoch(EpochNumberWithFraction.create(100n, 8n, 10n)!, true)!,
      ),
    );

    assert(
      Since.fromBlockNumber(1234n, true)!.cmp(
        Since.fromBlockNumber(2000n, false)!,
      ) === null,
    );
    assert(
      Since.fromEpoch(
        EpochNumberWithFraction.create(100n, 999n, 1000n)!,
        false,
      )!.cmp(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ) === null,
    );
    assert(
      Since.fromTimestamp(1234n, true)!.cmp(
        Since.fromTimestamp(2000n, false)!,
      ) === null,
    );
    assert(
      Since.fromBlockNumber(1234n, true)!.cmp(
        Since.fromTimestamp(2000n, false)!,
      ) === null,
    );
    assert(
      Since.fromBlockNumber(1234n, true)!.cmp(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ) === null,
    );
    assert(
      Since.fromTimestamp(1234n, true)!.cmp(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ) === null,
    );
  });
});
