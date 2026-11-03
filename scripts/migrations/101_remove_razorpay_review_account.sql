-- Run once Razorpay approves the account: removes the temporary reviewer login.
DELETE FROM contacts WHERE normalized_email = 'razorpay-review@indishmarketer.com';
DELETE FROM users WHERE email = 'razorpay-review@indishmarketer.com';
