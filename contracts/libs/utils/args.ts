import { Since } from "../ckb-since/src"
import { HighLevel, numFromBytes } from "@ckb-js-std/core";
import * as bindings from "@ckb-js-std/bindings";

class ByteCursor {
    constructor(
        private readonly data: ArrayBuffer,
        private offset = 0,
        private remaining: number = 0,
    ) {
        this.remaining = data.byteLength;
    }

    take(n: number): ArrayBuffer {
        if (n < 0)
            throw new RangeError("take length must be >= 0");
        if (n > this.remaining)
            throw new RangeError(`insufficient bytes: need ${n}, remaining ${this.remaining}`);
        const start = this.offset;
        const end = start + n;
        this.offset = end;
        return this.data.slice(start, end);
    }

    takeHash(): ArrayBuffer {
        return this.take(32);
    }
}

export class JsVMArgs {
    public flags!: ArrayBuffer;
    public jsScript!: ArrayBuffer;
    public jsArgs!: ArrayBuffer;

    constructor(args?: ArrayBuffer) {
        if (args == undefined) {
            args = HighLevel.loadScript().args;
        }

        this.flags = args.slice(0, 2);
        this.jsScript = args.slice(2, 35);
        this.jsArgs = args.slice(35);
    }

    public static loadLockJSVmArgs(index: number, source: bindings.SourceType): JsVMArgs | undefined {
        let args = HighLevel.loadCellLock(index, source).args;
        if (args.byteLength < 35) {
            return undefined;
        }
        return new JsVMArgs(args);
    }

    public static loadTypeJSVmArgs(index: number, source: bindings.SourceType): JsVMArgs | undefined {
        let script = HighLevel.loadCellType(index, source);
        if (script == null) {
            return undefined;
        }
        if (script.args.byteLength < 35) {
            return undefined;
        }
        return new JsVMArgs(script.args);
    }
}

export abstract class FixedArgsBase {
    public args!: JsVMArgs;

    constructor(args?: JsVMArgs | ArrayBuffer) {
        this.args =
            args instanceof JsVMArgs ? args : args ? new JsVMArgs(args) : new JsVMArgs();

        type FixedArgsCtor = typeof FixedArgsBase & { len(): number };
        const ctor = this.constructor as FixedArgsCtor;

        const need = ctor.len();
        const actual = this.args.jsArgs.byteLength;
        if (need !== actual) {
            throw new Error(
                `Args length is wrong and cannot be parsed. need (${need}) ,actual(${actual})`
            );
        }
        const cursor = new ByteCursor(this.args.jsArgs);
        this.parse(cursor);
    }
    protected abstract parse(cursor: ByteCursor): void;
    static len(): number {
        throw new Error("Subclass must override static len()");
    }
}

export class PorjectArgs extends FixedArgsBase {
    public typeId!: ArrayBuffer;
    public creatorLockScriptHash!: ArrayBuffer;
    public goalAmount!: bigint;
    public deadline!: Since;
    public contributionScript!: ArrayBuffer;
    public claimScript!: ArrayBuffer;
    public contributionType!: ArrayBuffer;

    constructor(args?: JsVMArgs | ArrayBuffer) {
        super(args);
    }

    static override len(): number {
        return 32 + 32 + 16 + 8 + 33 + 33 + 32;
    }

    protected override parse(buf: ByteCursor): void {
        this.typeId = buf.takeHash();
        this.creatorLockScriptHash = buf.takeHash();
        this.goalAmount = numFromBytes(buf.take(16));
        this.deadline = new Since(numFromBytes(buf.take(8)));
        this.contributionScript = buf.take(33);
        this.claimScript = buf.take(33);
        this.contributionType = buf.takeHash();
    }
}

export class ContributionArgs extends FixedArgsBase {
    public projectScriptHash!: ArrayBuffer;
    public deadline!: Since;
    public claimCodeHash!: ArrayBuffer;

    constructor(args?: JsVMArgs | ArrayBuffer) {
        super(args);
    }

    static override len(): number {
        return 32 + 8 + 33;
    }

    protected override parse(buf: ByteCursor): void {
        this.projectScriptHash = buf.takeHash();
        this.deadline = new Since(numFromBytes(buf.take(8)));
        this.claimCodeHash = buf.take(33);
    }
}

export class ClaimArgs extends FixedArgsBase {
    public projectScriptHash!: ArrayBuffer;
    public deadline!: Since;
    public backerLockScript!: ArrayBuffer;

    constructor(args?: JsVMArgs | ArrayBuffer) {
        super(args);
    }

    static override len(): number {
        return 32 + 8 + 32;
    }

    protected override parse(buf: ByteCursor): void {
        this.projectScriptHash = buf.takeHash();
        this.deadline = new Since(numFromBytes(buf.take(8)));
        this.backerLockScript = buf.takeHash();

    }
}
