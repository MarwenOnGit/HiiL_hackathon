// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MSMEContractRegistry
/// @notice Anchors the fingerprint of an MSME agreement on-chain, tracks confirmation
///         from each side, and lets anyone verify the agreement text hasn't been altered
///         after the fact.
/// @dev Consent tiers exist because most MSME counterparties will never hold a wallet or
///      a platform account of their own — see ARCHITECTURE.md Section 7. Only FULL_PLATFORM
///      requires a second on-chain signature; every other tier is confirmed by partyA alone,
///      because the counterparty's consent was already captured off-chain (evidenceHash) at
///      creation time (an OTP-verified link, a witnessed in-person confirmation, and so on).
contract MSMEContractRegistry {
    enum ConsentTier {
        UNILATERAL,
        IN_PERSON_WITNESSED,
        REMOTE_OTP_VERIFIED,
        FULL_PLATFORM
    }

    struct Agreement {
        bytes32 contentHash;     // keccak256 of the generated contract text
        address partyA;          // the MSME owner — always a platform account, always the creator
        address partyB;          // address(0) unless the counterparty also has a platform account
        ConsentTier tier;
        bytes32 evidenceHash;    // hash of an OTP log / photo / witnessed-consent record (0x0 for UNILATERAL)
        string metadataURI;      // pointer to the full contract document, stored off-chain
        uint256 createdAt;
        bool signedA;
        bool signedB;
    }

    mapping(uint256 => Agreement) private _agreements;
    uint256 public nextId;

    event AgreementCreated(uint256 indexed id, bytes32 contentHash, address indexed partyA, ConsentTier tier);
    event AgreementSigned(uint256 indexed id, address indexed signer);
    event AgreementExecuted(uint256 indexed id);

    error NotAParty();
    error UnknownAgreement();

    modifier exists(uint256 id) {
        if (id >= nextId) revert UnknownAgreement();
        _;
    }

    /// @notice Anchor a new agreement. Called by the backend relayer on behalf of the MSME
    ///         owner, so msg.sender becomes partyA.
    function createAgreement(
        bytes32 contentHash,
        address partyB,
        ConsentTier tier,
        bytes32 evidenceHash,
        string calldata metadataURI
    ) external returns (uint256 id) {
        id = nextId++;
        _agreements[id] = Agreement({
            contentHash: contentHash,
            partyA: msg.sender,
            partyB: partyB,
            tier: tier,
            evidenceHash: evidenceHash,
            metadataURI: metadataURI,
            createdAt: block.timestamp,
            signedA: false,
            signedB: false
        });
        emit AgreementCreated(id, contentHash, msg.sender, tier);
    }

    /// @notice Confirm the agreement. FULL_PLATFORM needs both parties to call this;
    ///         every other tier only needs partyA, since the counterparty's consent was
    ///         already captured off-chain at creation time.
    function sign(uint256 id) external exists(id) {
        Agreement storage a = _agreements[id];
        if (msg.sender != a.partyA && msg.sender != a.partyB) revert NotAParty();

        if (msg.sender == a.partyA) {
            a.signedA = true;
        } else {
            a.signedB = true;
        }
        emit AgreementSigned(id, msg.sender);

        bool executed = a.tier == ConsentTier.FULL_PLATFORM ? (a.signedA && a.signedB) : a.signedA;
        if (executed) {
            emit AgreementExecuted(id);
        }
    }

    /// @notice Anyone can independently confirm the agreement text hasn't been altered
    ///         since it was anchored, by recomputing the hash off-chain and checking it here.
    function verify(uint256 id, bytes32 contentHash) external view exists(id) returns (bool) {
        return _agreements[id].contentHash == contentHash;
    }

    function getAgreement(uint256 id) external view exists(id) returns (Agreement memory) {
        return _agreements[id];
    }

    function isExecuted(uint256 id) public view exists(id) returns (bool) {
        Agreement storage a = _agreements[id];
        return a.tier == ConsentTier.FULL_PLATFORM ? (a.signedA && a.signedB) : a.signedA;
    }
}
