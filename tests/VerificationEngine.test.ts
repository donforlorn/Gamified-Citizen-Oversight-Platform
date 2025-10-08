import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, boolCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_REPORT_ID = 101;
const ERR_INVALID_STAKE_AMOUNT = 102;
const ERR_REPORT_NOT_FOUND = 103;
const ERR_ALREADY_VERIFIED = 104;
const ERR_CONSENSUS_NOT_REACHED = 105;
const ERR_INVALID_THRESHOLD = 106;
const ERR_INVALID_VERIFICATION_TYPE = 107;
const ERR_INSUFFICIENT_STAKE = 108;
const ERR_VERIFICATION_CLOSED = 109;
const ERR_INVALID_TIMESTAMP = 110;
const ERR_NOT_REGISTERED_USER = 111;
const ERR_INVALID_EVIDENCE_HASH = 112;
const ERR_MAX_VERIFICATIONS_EXCEEDED = 113;
const ERR_INVALID_PENALTY_RATE = 114;
const ERR_INVALID_REWARD_RATE = 115;
const ERR_INVALID_DURATION = 116;
const ERR_INVALID_STATUS = 117;
const ERR_INVALID_CATEGORY = 118;
const ERR_INVALID_VOTE = 119;
const ERR_STAKE_LOCKED = 120;

interface Report {
  submitter: string;
  evidenceHash: Uint8Array;
  category: string;
  timestamp: number;
  status: boolean;
  verificationCount: number;
  positiveVotes: number;
  negativeVotes: number;
  totalStake: number;
  closeTime: number;
}

interface Verification {
  vote: boolean;
  stakeAmount: number;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class VerificationEngineMock {
  state: {
    nextVerificationId: number;
    verificationThreshold: number;
    minStakeAmount: number;
    maxVerificationsPerReport: number;
    penaltyRate: number;
    rewardRate: number;
    verificationDuration: number;
    adminPrincipal: string;
    reports: Map<number, Report>;
    verifications: Map<string, Verification>;
    userStakes: Map<string, number>;
  } = this.resetState();
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxBalances: Map<string, number> = new Map([["ST1TEST", 10000]]);
  transfers: Array<{ amount: number; from: string; to: string }> = [];

  private resetState() {
    return {
      nextVerificationId: 0,
      verificationThreshold: 51,
      minStakeAmount: 100,
      maxVerificationsPerReport: 100,
      penaltyRate: 20,
      rewardRate: 10,
      verificationDuration: 144,
      adminPrincipal: "ST1TEST",
      reports: new Map(),
      verifications: new Map(),
      userStakes: new Map(),
    };
  }

  reset() {
    this.state = this.resetState();
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxBalances = new Map([["ST1TEST", 10000]]);
    this.transfers = [];
  }

  setVerificationThreshold(newThreshold: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newThreshold <= 0 || newThreshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    this.state.verificationThreshold = newThreshold;
    return { ok: true, value: true };
  }

  setMinStakeAmount(newAmount: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newAmount <= 0) return { ok: false, value: ERR_INVALID_STAKE_AMOUNT };
    this.state.minStakeAmount = newAmount;
    return { ok: true, value: true };
  }

  setPenaltyRate(newRate: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newRate > 50) return { ok: false, value: ERR_INVALID_PENALTY_RATE };
    this.state.penaltyRate = newRate;
    return { ok: true, value: true };
  }

  setRewardRate(newRate: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newRate > 20) return { ok: false, value: ERR_INVALID_REWARD_RATE };
    this.state.rewardRate = newRate;
    return { ok: true, value: true };
  }

  submitReport(evidenceHash: Uint8Array, category: string): Result<number> {
    if (evidenceHash.length !== 32) return { ok: false, value: ERR_INVALID_EVIDENCE_HASH };
    if (!["infrastructure", "corruption", "environment"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    const id = this.state.nextVerificationId;
    this.state.reports.set(id, {
      submitter: this.caller,
      evidenceHash,
      category,
      timestamp: this.blockHeight,
      status: false,
      verificationCount: 0,
      positiveVotes: 0,
      negativeVotes: 0,
      totalStake: 0,
      closeTime: this.blockHeight + this.state.verificationDuration,
    });
    this.state.nextVerificationId++;
    return { ok: true, value: id };
  }

  verifyReport(reportId: number, vote: boolean, stakeAmount: number): Result<boolean> {
    const report = this.state.reports.get(reportId);
    if (!report) return { ok: false, value: ERR_REPORT_NOT_FOUND };
    if (reportId <= 0) return { ok: false, value: ERR_INVALID_REPORT_ID };
    if (stakeAmount < this.state.minStakeAmount || stakeAmount <= 0) return { ok: false, value: ERR_INVALID_STAKE_AMOUNT };
    if (!this.state.userStakes.has(this.caller) || this.state.userStakes.get(this.caller)! <= 0) return { ok: false, value: ERR_NOT_REGISTERED_USER };
    const key = `${reportId}-${this.caller}`;
    if (this.state.verifications.has(key)) return { ok: false, value: ERR_ALREADY_VERIFIED };
    if (this.blockHeight >= report.closeTime) return { ok: false, value: ERR_VERIFICATION_CLOSED };
    if ((this.stxBalances.get(this.caller) || 0) < stakeAmount) return { ok: false, value: ERR_INSUFFICIENT_STAKE };
    this.stxBalances.set(this.caller, (this.stxBalances.get(this.caller) || 0) - stakeAmount);
    this.stxBalances.set("contract", (this.stxBalances.get("contract") || 0) + stakeAmount);
    this.transfers.push({ amount: stakeAmount, from: this.caller, to: "contract" });
    this.state.verifications.set(key, { vote, stakeAmount, timestamp: this.blockHeight });
    this.state.reports.set(reportId, {
      ...report,
      verificationCount: report.verificationCount + 1,
      positiveVotes: vote ? report.positiveVotes + 1 : report.positiveVotes,
      negativeVotes: !vote ? report.negativeVotes + 1 : report.negativeVotes,
      totalStake: report.totalStake + stakeAmount,
    });
    return { ok: true, value: true };
  }

  resolveConsensus(reportId: number): Result<boolean> {
    const report = this.state.reports.get(reportId);
    if (!report) return { ok: false, value: ERR_REPORT_NOT_FOUND };
    if (this.blockHeight < report.closeTime) return { ok: false, value: ERR_VERIFICATION_CLOSED };
    if (report.status) return { ok: false, value: ERR_INVALID_STATUS };
    const threshold = Math.floor((report.verificationCount * this.state.verificationThreshold) / 100);
    if (report.positiveVotes >= threshold) {
      this.state.reports.set(reportId, { ...report, status: true });
      return { ok: true, value: true };
    }
    return { ok: false, value: ERR_CONSENSUS_NOT_REACHED };
  }
}

describe("VerificationEngine", () => {
  let contract: VerificationEngineMock;

  beforeEach(() => {
    contract = new VerificationEngineMock();
    contract.reset();
  });

  it("submits a report successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.submitReport(hash, "infrastructure");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const report = contract.state.reports.get(0);
    expect(report?.category).toBe("infrastructure");
    expect(report?.status).toBe(false);
  });

  it("rejects invalid evidence hash", () => {
    const hash = new Uint8Array(31).fill(0);
    const result = contract.submitReport(hash, "infrastructure");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EVIDENCE_HASH);
  });

  it("resolves consensus successfully", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.submitReport(hash, "infrastructure");
    contract.state.userStakes.set("ST1TEST", 100);
    contract.verifyReport(0, true, 100);
    contract.blockHeight = 145;
    const result = contract.resolveConsensus(0);
    expect(result.ok).toBe(true);
    const report = contract.state.reports.get(0);
    expect(report?.status).toBe(true);
  });

  it("rejects consensus before close time", () => {
    const hash = new Uint8Array(32).fill(0);
    contract.submitReport(hash, "infrastructure");
    const result = contract.resolveConsensus(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VERIFICATION_CLOSED);
  });

  it("sets verification threshold successfully", () => {
    const result = contract.setVerificationThreshold(60);
    expect(result.ok).toBe(true);
    expect(contract.state.verificationThreshold).toBe(60);
  });

  it("rejects invalid threshold", () => {
    const result = contract.setVerificationThreshold(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_THRESHOLD);
  });

  it("sets min stake amount successfully", () => {
    const result = contract.setMinStakeAmount(200);
    expect(result.ok).toBe(true);
    expect(contract.state.minStakeAmount).toBe(200);
  });

  it("rejects min stake change by non-admin", () => {
    contract.caller = "ST2FAKE";
    const result = contract.setMinStakeAmount(200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets penalty rate successfully", () => {
    const result = contract.setPenaltyRate(30);
    expect(result.ok).toBe(true);
    expect(contract.state.penaltyRate).toBe(30);
  });

  it("rejects invalid penalty rate", () => {
    const result = contract.setPenaltyRate(51);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PENALTY_RATE);
  });

  it("sets reward rate successfully", () => {
    const result = contract.setRewardRate(15);
    expect(result.ok).toBe(true);
    expect(contract.state.rewardRate).toBe(15);
  });

  it("rejects invalid reward rate", () => {
    const result = contract.setRewardRate(21);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REWARD_RATE);
  });
});