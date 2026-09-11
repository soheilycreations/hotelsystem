-- Adds a "Owner / Boss" payment method — for purchases or expenses the
-- owner pays for out of his own pocket, not from the restaurant's cash
-- drawer. Kept out of the "cash" bucket so it never gets deducted from the
-- Cash Book's cash-in-hand balance, while still posting as a normal
-- expense for stock/P&L purposes.
alter type payment_method add value if not exists 'owner_paid';
