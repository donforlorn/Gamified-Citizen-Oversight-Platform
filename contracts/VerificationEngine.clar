(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-REPORT-ID u101)
(define-constant ERR-INVALID-STAKE-AMOUNT u102)
(define-constant ERR-REPORT-NOT-FOUND u103)
(define-constant ERR-ALREADY-VERIFIED u104)
(define-constant ERR-CONSENSUS-NOT-REACHED u105)
(define-constant ERR-INVALID-THRESHOLD u106)
(define-constant ERR-INVALID-VERIFICATION-TYPE u107)
(define-constant ERR-INSUFFICIENT-STAKE u108)
(define-constant ERR-VERIFICATION-CLOSED u109)
(define-constant ERR-INVALID-TIMESTAMP u110)
(define-constant ERR-NOT-REGISTERED-USER u111)
(define-constant ERR-INVALID-EVIDENCE-HASH u112)
(define-constant ERR-MAX-VERIFICATIONS-EXCEEDED u113)
(define-constant ERR-INVALID-PENALTY-RATE u114)
(define-constant ERR-INVALID-REWARD-RATE u115)
(define-constant ERR-INVALID-DURATION u116)
(define-constant ERR-INVALID-STATUS u117)
(define-constant ERR-INVALID-CATEGORY u118)
(define-constant ERR-INVALID-VOTE u119)
(define-constant ERR-STAKE-LOCKED u120)

(define-data-var next-verification-id uint u0)
(define-data-var verification-threshold uint u51)
(define-data-var min-stake-amount uint u100)
(define-data-var max-verifications-per-report uint u100)
(define-data-var penalty-rate uint u20)
(define-data-var reward-rate uint u10)
(define-data-var verification-duration uint u144)
(define-data-var admin-principal principal tx-sender)

(define-map reports
  uint
  {
    submitter: principal,
    evidence-hash: (buff 32),
    category: (string-utf8 50),
    timestamp: uint,
    status: bool,
    verification-count: uint,
    positive-votes: uint,
    negative-votes: uint,
    total-stake: uint,
    close-time: uint
  }
)

(define-map verifications
  { report-id: uint, verifier: principal }
  {
    vote: bool,
    stake-amount: uint,
    timestamp: uint
  }
)

(define-map user-stakes
  principal
  uint
)

(define-read-only (get-report (id uint))
  (map-get? reports id)
)

(define-read-only (get-verification (report-id uint) (verifier principal))
  (map-get? verifications { report-id: report-id, verifier: verifier })
)

(define-read-only (get-user-stake (user principal))
  (default-to u0 (map-get? user-stakes user))
)

(define-private (validate-report-id (id uint))
  (if (> id u0)
    (ok true)
    (err ERR-INVALID-REPORT-ID))
)

(define-private (validate-stake-amount (amount uint))
  (if (and (>= amount (var-get min-stake-amount)) (> amount u0))
    (ok true)
    (err ERR-INVALID-STAKE-AMOUNT))
)

(define-private (validate-verification-type (vote bool))
  (ok true)
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-evidence-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    (err ERR-INVALID-EVIDENCE-HASH))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (or (is-eq cat "infrastructure") (is-eq cat "corruption") (is-eq cat "environment"))
    (ok true)
    (err ERR-INVALID-CATEGORY))
)

(define-private (validate-vote (vote bool))
  (ok true)
)

(define-private (validate-user-registered (user principal))
  (if (> (get-user-stake user) u0)
    (ok true)
    (err ERR-NOT-REGISTERED-USER))
)

(define-public (set-verification-threshold (new-threshold uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (and (> new-threshold u0) (<= new-threshold u100)) (err ERR-INVALID-THRESHOLD))
    (var-set verification-threshold new-threshold)
    (ok true)
  )
)

(define-public (set-min-stake-amount (new-amount uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-amount u0) (err ERR-INVALID-STAKE-AMOUNT))
    (var-set min-stake-amount new-amount)
    (ok true)
  )
)

(define-public (set-penalty-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= new-rate u50) (err ERR-INVALID-PENALTY-RATE))
    (var-set penalty-rate new-rate)
    (ok true)
  )
)

(define-public (set-reward-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= new-rate u20) (err ERR-INVALID-REWARD-RATE))
    (var-set reward-rate new-rate)
    (ok true)
  )
)

(define-public (submit-report (evidence-hash (buff 32)) (category (string-utf8 50)))
  (let ((next-id (+ (var-get next-verification-id) u1)))
    (try! (validate-evidence-hash evidence-hash))
    (try! (validate-category category))
    (map-set reports next-id
      {
        submitter: tx-sender,
        evidence-hash: evidence-hash,
        category: category,
        timestamp: block-height,
        status: false,
        verification-count: u0,
        positive-votes: u0,
        negative-votes: u0,
        total-stake: u0,
        close-time: (+ block-height (var-get verification-duration))
      }
    )
    (var-set next-verification-id next-id)
    (print { event: "report-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (verify-report (report-id uint) (vote bool) (stake-amount uint))
  (let ((report (unwrap! (map-get? reports report-id) (err ERR-REPORT-NOT-FOUND))))
    (try! (validate-report-id report-id))
    (try! (validate-stake-amount stake-amount))
    (try! (validate-vote vote))
    (try! (validate-user-registered tx-sender))
    (asserts! (is-none (map-get? verifications { report-id: report-id, verifier: tx-sender })) (err ERR-ALREADY-VERIFIED))
    (asserts! (< block-height (get close-time report)) (err ERR-VERIFICATION-CLOSED))
    (asserts! (>= (stx-get-balance tx-sender) stake-amount) (err ERR-INSUFFICIENT-STAKE))
    (try! (stx-transfer? stake-amount tx-sender (as-contract tx-sender)))
    (map-set verifications { report-id: report-id, verifier: tx-sender }
      {
        vote: vote,
        stake-amount: stake-amount,
        timestamp: block-height
      }
    )
    (map-set reports report-id
      (merge report
        {
          verification-count: (+ (get verification-count report) u1),
          positive-votes: (if vote (+ (get positive-votes report) u1) (get positive-votes report)),
          negative-votes: (if (not vote) (+ (get negative-votes report) u1) (get negative-votes report)),
          total-stake: (+ (get total-stake report) stake-amount)
        }
      )
    )
    (print { event: "report-verified", id: report-id, verifier: tx-sender })
    (ok true)
  )
)

(define-public (resolve-consensus (report-id uint))
  (let ((report (unwrap! (map-get? reports report-id) (err ERR-REPORT-NOT-FOUND))))
    (asserts! (>= block-height (get close-time report)) (err ERR-VERIFICATION-CLOSED))
    (asserts! (not (get status report)) (err ERR-INVALID-STATUS))
    (let ((threshold (/ (* (get verification-count report) (var-get verification-threshold)) u100)))
      (if (>= (get positive-votes report) threshold)
        (begin
          (map-set reports report-id (merge report { status: true }))
          (ok true)
        )
        (err ERR-CONSENSUS-NOT-REACHED)
      )
    )
  )
)

(define-public (distribute-rewards (report-id uint))
  (let ((report (unwrap! (map-get? reports report-id) (err ERR-REPORT-NOT-FOUND))))
    (asserts! (get status report) (err ERR-INVALID-STATUS))
    (let ((total-stake (get total-stake report))
          (positive-votes (get positive-votes report))
          (reward-pool (* total-stake (var-get reward-rate) / u100)))
      (fold distribute-to-verifier (get-verifiers report-id) (ok reward-pool))
    )
  )
)

(define-private (distribute-to-verifier (verifier principal) (acc (response uint uint)))
  (match acc
    remaining
    (let ((verif (unwrap-panic (get-verification report-id verifier))))
      (if (get vote verif)
        (let ((share (/ (* (get stake-amount verif) remaining) total-stake)))
          (try! (as-contract (stx-transfer? share tx-sender verifier)))
          (ok (- remaining share))
        )
        (let ((penalty (/ (* (get stake-amount verif) (var-get penalty-rate)) u100)))
          (try! (as-contract (stx-transfer? penalty tx-sender (var-get admin-principal))))
          (ok remaining)
        )
      )
    )
    err err
  )
)

(define-private (get-verifiers (report-id uint))
  (filter has-verified (map-get? verifications report-id))
)

(define-private (has-verified (entry { verifier: principal }))
  (is-some (get-verification report-id (get verifier entry)))
)