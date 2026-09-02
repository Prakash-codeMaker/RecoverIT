# RecoverIT workflow

A RecoverIT case is a durable process, not a chat thread:

`Report → Verify → Investigate → Prepare recovery → User approval → External action → Monitor → Resolve`

The current workflow position and next action are persisted with the case. Background jobs can resume the same case after the browser is closed. When something is missing or uncertain, the system can stop and ask for a specific item rather than guess.

The landing page shows the customer journey; this document explains the operating model.