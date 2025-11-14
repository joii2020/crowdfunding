import { hexFrom, Transaction, hashCkb, hashTypeToBytes, numLeToBytes } from "@ckb-ccc/core";
import { Resource, Verifier, } from "ckb-testtool";

import * as misc from "./mock-misc"
import { TxHelper, generateRandHash, zeroHash, joinHex } from "./mock-tx-helper";


async function success() {
    let helper = new TxHelper();

    const userLock = helper.createAlwaySuc("UserLock1");
    const contributionType = helper.createAlwaySuc("contributionType");

    let prjArgs = new misc.ProjectArgs();
    prjArgs.typeID = generateRandHash();
    prjArgs.creatorLockScriptHash = userLock.hash();
    prjArgs.goalAmount = misc.CKBToShannon(100n);
    prjArgs.contributionType = contributionType.hash();

    prjArgs.contributionScript =
        joinHex(
            hashCkb(helper.appendCell(misc.scriptContribution).outputData),
            hexFrom(hashTypeToBytes("data2")));
    prjArgs.claimScript =
        joinHex(
            hashCkb(helper.appendCell(misc.scriptClaim).outputData),
            hexFrom(hashTypeToBytes("data2")));

    const prjLock = helper.createAlwaySuc("Project");
    const prjScript = helper.createJsScript(misc.scriptProject, prjArgs.toBytes());

    const input_prj = helper.resource.mockCell(prjLock, prjScript);

    let contributionArgs = new misc.ContributionArgs();
    contributionArgs.projectScript = prjScript.hash();
    contributionArgs.deadline = prjArgs.deadline;
    const contributionScript = helper.createJsScript(misc.scriptContribution, contributionArgs.toBytes());

    const input_0 =
        helper.resource.mockCell(
            contributionScript, contributionType, "0x", misc.CKBToShannon(10n));
    const input_1 =
        helper.resource.mockCell(
            contributionScript, contributionType, "0x", misc.CKBToShannon(10n));
    const input_2 =
        helper.resource.mockCell(
            contributionScript, contributionType, "0x", misc.CKBToShannon(40n));
    const input_3 =
        helper.resource.mockCell(
            contributionScript, contributionType, "0x", misc.CKBToShannon(60n));

    const output = Resource.createCellOutput(userLock, undefined, misc.CKBToShannon(10n + 10n + 40n + 60n));

    let tx = Transaction.from({
        inputs: [
            input_prj,
            input_0,
            input_1,
            input_2,
            input_3,
        ],
        outputs: [
            output
        ],
        outputsData: [
            hexFrom("0x"),
        ],
    });

    tx = TxHelper.updateSince(tx);
    tx = helper.updateScriptDeps(tx);

    const verifier = Verifier.from(helper.resource, tx);
    verifier.verifySuccess(true);
}

async function destroyProject() {
    let helper = new TxHelper();

    const defLock = helper.createAlwaySuc("def");

    let prjArgs = new misc.ProjectArgs();
    prjArgs.typeID = generateRandHash();
    prjArgs.setExpirationTime();
    const prjScript = helper.createJsScript(misc.scriptProject, prjArgs.toBytes());

    const input = helper.resource.mockCell(defLock, prjScript);
    const output = Resource.createCellOutput(defLock);

    let tx = Transaction.from({
        inputs: [
            input
        ],
        outputs: [
            output
        ],
        outputsData: [
            hexFrom("0x"),
        ],
    });

    tx = TxHelper.updateSince(tx);
    tx = helper.updateScriptDeps(tx);

    const verifier = Verifier.from(helper.resource, tx);
    verifier.verifySuccess(true);
}

async function destroyClaim() {
    let helper = new TxHelper();

    const defLock = helper.createAlwaySuc("def");

    let claimArgs = new misc.ClaimArgs();
    claimArgs.setExpirationTime();
    const claimScript = helper.createJsScript(misc.scriptClaim, claimArgs.toBytes());

    const input = helper.resource.mockCell(defLock, claimScript, hexFrom(numLeToBytes(misc.CKBToShannon(200n), 16)));
    const output = Resource.createCellOutput(defLock);

    let tx = Transaction.from({
        inputs: [
            input
        ],
        outputs: [
            output
        ],
        outputsData: [
            hexFrom("0x"),
        ],
    });

    tx = TxHelper.updateSince(tx);
    tx = helper.updateScriptDeps(tx);

    const verifier = Verifier.from(helper.resource, tx);
    verifier.verifySuccess(true);
}

async function refund() {
    let helper = new TxHelper();

    const defLock = helper.createAlwaySuc("def");

    let contributionArgs = new misc.ContributionArgs();
    contributionArgs.setExpirationTime();

    let claimArgs = new misc.ClaimArgs();
    claimArgs.deadline = contributionArgs.deadline;
    claimArgs.backerLockScript = defLock.hash();
    contributionArgs.claimScript = helper.getJsScript(misc.scriptClaim)!;
    const contributionScript = helper.createJsScript(misc.scriptContribution, contributionArgs.toBytes());

    const claimScript = helper.createJsScript(misc.scriptClaim, claimArgs.toBytes());

    const input = helper.resource.mockCell(defLock, claimScript, hexFrom(numLeToBytes(misc.CKBToShannon(200n), 16)));
    const input_0 = helper.resource.mockCell(contributionScript, undefined, "0x", misc.CKBToShannon(10000n));
    const output = Resource.createCellOutput(defLock, undefined, misc.CKBToShannon(201n));

    let tx = Transaction.from({
        inputs: [
            input,
            input_0,
        ],
        outputs: [
            output
        ],
        outputsData: [
            hexFrom("0x"),
        ],
    });

    tx = TxHelper.updateSince(tx);
    tx = helper.updateScriptDeps(tx);

    const verifier = Verifier.from(helper.resource, tx);
    verifier.verifySuccess(true);
}

describe("unit test end", () => {
    test("success", () => {
        success();
    });
    test("destory project", () => {
        destroyProject();
    });
    test("destory claim", () => {
        destroyClaim();
    });
    test("refund", () => {
        refund();
    });
});
