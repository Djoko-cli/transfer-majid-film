export default {
  // Navbar
  "navbar.upload": "Upload",
  "navbar.contact": "Contact",
  "navbar.signin": "Sign in",
  "navbar.home": "Home",
  "navbar.signup": "Sign up",

  "navbar.links.shares": "My transfers",
  "navbar.links.reverse": "Reverse shares",
  "navbar.links.received": "Received transfers",

  "navbar.avatar.account": "My account",
  "navbar.avatar.admin": "Administration",
  "navbar.avatar.signout": "Sign out",
  // END navbar

  // /
  "home.title": "A <h>self-hosted</h> file sharing platform.",

  "home.description":
    "Do you really want to give your personal files in the hand of third parties like WeTransfer?",
  "home.bullet.a.name": "Self-Hosted",
  "home.bullet.a.description": "Host it on your own machine.",
  "home.bullet.b.name": "Privacy",
  "home.bullet.b.description":
    "Your files are yours and will never be accessed by third parties.",
  "home.bullet.c.name": "No annoying file size limit",
  "home.bullet.c.description":
    "Upload files as big as you want. Only your hard drive will be your limit.",

  "home.button.start": "Get started",
  "home.button.source": "Source code",
  // END /

  // /auth/signin
  "signin.title": "Sign in",
  "signin.title.recent-signout": "Welcome back",
  "signin.description": "You don't have an account yet?",
  "signin.button.signup": "Sign up",
  "signin.input.email-or-username": "Email or username",
  "signin.input.email-or-username.placeholder": "Your email or username",
  "signin.input.password": "Password",
  "signin.input.password.placeholder": "Your password",
  "signin.button.submit": "Sign in",
  "signin.remember-device": "Remember me on this device",
  "signin.trusted.welcome-back": "Welcome back {username}",
  "signin.trusted.button.submit": "Sign in",
  "signin.trusted.not-you": "Not you?",
  "signIn.notify.totp-required.title": "Two-factor authentication required",
  "signIn.notify.totp-required.description":
    "Please enter your two-factor authentication code",
  "signIn.oauth.or": "OR",
  "signIn.oauth.signInWith": "Sign in with",
  "signIn.oauth.github": "GitHub",
  "signIn.oauth.google": "Google",
  "signIn.oauth.microsoft": "Microsoft",
  "signIn.oauth.discord": "Discord",
  "signIn.oauth.oidc": "OpenID",

  // END /auth/signin

  // /auth/signup
  "signup.title": "Create an account",
  "signup.description": "Already have an account?",
  "signup.button.signin": "Sign in",
  "signup.input.username": "Username",
  "signup.input.username.placeholder": "Your username",
  "signup.input.email": "Email",
  "signup.input.email.placeholder": "Your email",
  "signup.button.submit": "Let's get started",
  "signup.onboarding.title": "Welcome to Transfer",
  "signup.onboarding.description":
    "No account exists on this instance yet. The account you create here automatically becomes admin.",
  "signup.onboarding.button.submit": "Create the admin account",
  "signUp.oauth.or": "OR",
  "signUp.oauth.signUpWith": "Sign up with",

  // /auth/verify
  "verify.title": "Verify Account",
  "verify.success":
    "Your account has been successfully verified! You can now sign in.",
  "verify.error": "The verification link is invalid or has expired.",
  "verify.button.signin": "Go to Sign In",
  "verify.info.title": "Account Verification",
  "verify.info.description":
    "We've sent a verification code to your email address. Enter it below, or just click the link in that email.",
  "verify.info.note":
    "If you don't receive the email within a few minutes, please check your spam folder.",
  "verify.info.code.ariaLabel": "Verification code",
  "verify.info.code.button": "Verify",
  "verify.info.resend.button": "Resend verification email",
  "verify.info.resend.button.cooldown": "Resend verification email ({seconds}s)",
  "verify.info.resend.success": "Verification email resent successfully.",
  "verify.info.resend.error": "Failed to resend verification email.",

  // END /auth/signup

  // /auth/totp
  "totp.title": "Two-factor authentication",
  "totp.input.code.ariaLabel": "One time code",
  "totp.button.signIn": "Sign in",

  // END /auth/totp

  // /auth/reset-password
  "resetPassword.title": "Forgot your password?",
  "resetPassword.description": "Enter your email to reset your password.",
  "resetPassword.notify.success":
    "A message with a link to reset your password has been sent if the provided email exists.",
  "resetPassword.button.back": "Back to sign in page",
  "resetPassword.text.resetPassword": "Reset password",
  "resetPassword.text.enterNewPassword": "Enter your new password",
  "resetPassword.input.password": "New password",
  "resetPassword.input.confirmPassword": "Confirm password",
  "resetPassword.notify.passwordReset":
    "Your password has been successfully reset.",

  // /account
  "account.title": "My account",

  "account.card.info.title": "Account info",
  "account.card.info.username": "Username",
  "account.card.info.email": "Email",
  "account.card.avatar.title": "Profile picture",
  "account.card.avatar.description":
    "It replaces your account icon. Only you can see it. 5 MiB maximum.",
  "account.card.avatar.change": "Choose a picture",
  "account.card.avatar.remove": "Remove",
  "account.card.avatar.saved": "Profile picture saved.",
  "account.card.avatar.removed": "Profile picture removed.",
  "account.card.avatar.too-large": "That image is over 5 MiB.",
  "account.notify.info.success": "Account updated successfully",

  "account.card.password.title": "Password",
  "account.card.password.old": "Old password",
  "account.card.password.new": "New password",
  "account.card.password.noPasswordSet":
    "You do not have a password set. To sign in using your email and password, you need to create a password.",
  "account.notify.password.success": "Password changed successfully",

  "account.card.oauth.title": "Social login",
  "account.card.oauth.github": "GitHub",
  "account.card.oauth.google": "Google",
  "account.card.oauth.microsoft": "Microsoft",
  "account.card.oauth.discord": "Discord",
  "account.card.oauth.oidc": "OpenID",
  "account.card.oauth.link": "Link",
  "account.card.oauth.unlink": "Unlink",
  "account.card.oauth.unlinked": "Unlinked",
  "account.modal.unlink.title": "Unlink account",
  "account.modal.unlink.description":
    "Unlinking your social accounts may cause you to lose your account if you don't remember your login credentials",
  "account.notify.oauth.unlinked.success": "Unlinked successfully",

  "account.card.security.title": "Security",
  "account.card.security.totp.tab": "Two-factor authentication",
  "account.card.security.totp.enable.description":
    "Enter your current password to start enabling two-factor authentication",
  "account.card.security.totp.disable.description":
    "Enter your current password to disable two-factor authentication",
  "account.card.security.totp.button.start": "Start",
  "account.card.security.trustedDevices.tab": "Trusted devices",
  "account.card.security.trustedDevices.description":
    "A device you checked \"Remember me on this device\" for can sign back in with one click, no password or code, for 30 days. Revoke them all if one no longer feels trustworthy — a shared computer, for instance.",
  "account.card.security.trustedDevices.empty": "No active trusted devices.",
  "account.card.security.trustedDevices.column.since": "Since",
  "account.card.security.trustedDevices.column.device": "Device",
  "account.card.security.trustedDevices.column.ip": "IP address",
  "account.card.security.trustedDevices.column.expires": "Expires",
  "account.card.security.trustedDevices.revoke.button": "Revoke all devices",
  "account.card.security.trustedDevices.revoke.title":
    "Revoke trusted devices?",
  "account.card.security.trustedDevices.revoke.description":
    "Each of these devices will need to sign in again with the password and, if enabled, two-factor authentication. Your current session isn't affected.",
  "account.card.security.trustedDevices.revoke.confirm": "Revoke",
  "account.card.security.trustedDevices.revoke.success":
    "Trusted devices revoked.",
  "account.modal.totp.title": "Enable two-factor authentication",
  "account.modal.totp.step1": "Step 1: Add your authenticator",
  "account.modal.totp.step2": "Step 2: Validate your code",
  "account.modal.totp.enterManually": "Enter manually",
  "account.modal.totp.code": "Code",
  "common.button.clickToCopy": "Click to copy",
  "common.button.showQRCode": "Show QR code",
  "account.modal.totp.verify": "Verify",
  "account.notify.totp.disable": "Two-factor authentication disabled successfully",
  "account.notify.totp.enable": "Two-factor authentication enabled successfully",
  "account.card.notifications.title": "Notifications",
  "account.card.notifications.expiring-shares.label":
    "Notify me before my transfers expire",
  "account.card.notifications.expiring-shares.description":
    "Receive an email when a transfer you created or sent is about to expire.",
  "account.card.notifications.sent-shares.label":
    "Email me a summary of my transfers",
  "account.card.notifications.sent-shares.description":
    "Receive an email as soon as a transfer is ready, with its link, its contents and the list of recipients.",
  "account.notify.notifications.success":
    "Notification preferences saved.",

  "account.card.info.pending-email.title": "New address to confirm",
  "account.card.info.pending-email.description":
    "A code was sent to {email}. Your current address stays in force until it is entered — if that address is wrong, just cancel.",
  "account.card.info.pending-email.code": "6-digit code",
  "account.card.info.pending-email.resend": "Resend the code",
  "account.card.info.pending-email.resend-in": "Resend in {seconds}s",
  "account.notify.email-change.resent": "A new code was sent to {email}.",
  "account.card.info.pending-email.confirm": "Confirm",
  "account.card.info.pending-email.cancel": "Cancel",
  "account.notify.email-change.requested":
    "A code was sent to {email}. Your address will not change until it is entered.",
  "account.notify.email-change.confirmed": "Your address has been changed.",
  "account.notify.email-change.cancelled": "Address change cancelled.",
  "account.card.language.title": "Language",
  "account.card.language.description":
    "English and French are the only two languages maintained.",
  "account.card.color.title": "Color scheme",

  // ThemeSwitcher.tsx
  "account.theme.dark": "Dark",
  "account.theme.light": "Light",
  "account.theme.system": "System",

  "account.button.delete": "Delete Account",
  "account.modal.delete.title": "Delete Account",
  "account.modal.delete.description":
    "Do you really want to delete your account including all your active transfers?",
  // END /account

  // /account/shares
  "account.shares.title": "My transfers",
  "account.shares.title.empty": "It's empty here 👀",
  "account.shares.description.empty": "You don't have any transfers.",
  "account.shares.button.create": "Create one",

  "account.shares.info.title": "Transfer information",
  "account.shares.button.edit": "Add/Remove Files",
  "account.shares.table.id": "ID",
  "account.shares.table.name": "Name",
  "account.shares.table.description": "Description",
  "account.shares.table.visitors": "Visitors",
  "account.shares.table.expiresAt": "Expires on",
  "account.shares.table.createdAt": "Created on",
  "account.shares.table.size": "Size",
  "account.shares.table.password-protected": "Password protected",
  "account.shares.table.recipients": "Recipients",
  "account.shares.table.restricted-to-recipients":
    "Restricted to recipients only",
  "account.shares.table.shared-with-recipients": "Shared with recipients",
  "account.shares.table.visitor-count": "{count} of {max}",
  "account.shares.table.expiry-never": "Never",

  "account.shares.modal.share-informations": "Transfer information",
  "account.shares.modal.view-downloads": "View download history",
  "account.shares.modal.share-link": "Transfer link",
  "account.shares.modal.edit.password.keep":
    "Leave blank to keep the current password",
  "account.shares.modal.edit.password.remove": "Remove password protection",

  "account.shares.modal.delete.title": "Delete transfer: {share}",
  "account.shares.modal.delete.description":
    "The link will stop working immediately. This action cannot be undone.",

  // END /account/shares

  // /account/received
  "account.received-shares.title": "Received transfers",
  "account.received-shares.title.empty": "No transfers received yet",
  "account.received-shares.description.empty":
    "Transfers sent to your email address will appear here.",
  "account.received-shares.table.from": "From",
  "account.received-shares.button.open": "Open",
  // END /account/received

  // /account/reverseShares
  "account.reverseShares.title": "Reverse shares",
  "account.reverseShares.description":
    "A reverse share allows you to generate a unique URL that allows external users to create a transfer.",

  "account.reverseShares.title.empty": "It's empty here 👀",
  "account.reverseShares.description.empty":
    "You don't have any reverse shares.",

  // showCreateReverseShareModal.tsx
  "account.reverseShares.modal.title": "Create reverse share",
  "account.reverseShares.modal.expiration.label": "Expiration",
  "account.reverseShares.modal.expiration.minute-singular": "Minute",
  "account.reverseShares.modal.expiration.minute-plural": "Minutes",
  "account.reverseShares.modal.expiration.hour-singular": "Hour",
  "account.reverseShares.modal.expiration.hour-plural": "Hours",
  "account.reverseShares.modal.expiration.day-singular": "Day",
  "account.reverseShares.modal.expiration.day-plural": "Days",
  "account.reverseShares.modal.expiration.week-singular": "Week",
  "account.reverseShares.modal.expiration.week-plural": "Weeks",
  "account.reverseShares.modal.expiration.month-singular": "Month",
  "account.reverseShares.modal.expiration.month-plural": "Months",
  "account.reverseShares.modal.expiration.year-singular": "Year",
  "account.reverseShares.modal.expiration.year-plural": "Years",

  "account.reverseShares.modal.name.label": "Name",
  "account.reverseShares.modal.description.label": "Description",

  "account.reverseShares.modal.max-size.label": "Max transfer size",

  "account.reverseShares.modal.send-email": "Send email notifications",
  "account.reverseShares.modal.send-email.description":
    "Sends you an email notification when a transfer is created with this reverse share link.",

  "account.reverseShares.modal.public-access": "Public access",
  "account.reverseShares.modal.public-access.description":
    "Make the transfers created with this reverse share public. If disabled, only you and the transfer creator will have access to view it.",

  "account.reverseShares.modal.max-use.label": "Max uses",
  "account.reverseShares.modal.max-use.description":
    "The maximum amount of times this URL can be used to create a transfer.",
  "account.reverseShares.modal.password.label": "Password protection",
  "account.reverseShares.modal.max-views.label": "Maximum views",
  "account.reverseShare.never-expires": "This reverse share will never expire.",
  "account.reverseShare.expires-on":
    "This reverse share will expire on {expiration}.",

  "account.reverseShares.table.no-shares": "No transfers created yet",
  "account.reverseShares.table.count.singular": "transfer",
  "account.reverseShares.table.count.plural": "transfers",
  "account.reverseShares.table.name": "Name",
  "account.reverseShares.table.shares": "Transfers",
  "account.reverseShares.table.remaining": "Remaining uses",
  "account.reverseShares.table.max-size": "Max transfer size",
  "account.reverseShares.table.expires": "Expires at",

  "account.reverseShares.modal.reverse-share-link": "Reverse share link",

  "account.reverseShares.modal.delete.title": "Delete reverse share",
  "account.reverseShares.modal.delete.description":
    "Do you really want to delete this reverse share? If you do, the associated transfers will be deleted as well.",

  // END /account/reverseShares

  // /admin
  "admin.title": "Administration",
  "admin.button.users": "User management",
  "admin.button.shares": "Transfer management",
  "admin.button.brand": "Slideshow",
  "admin.button.config": "Configuration",
  "admin.version": "Version",
  // END /admin

  // /admin/intro
  "admin.intro.title": "Welcome to {appName}",
  "admin.intro.description": "Your admin account is ready.",
  "admin.intro.question": "How do you want to continue?",
  "admin.intro.button.config": "Customize configuration",
  "admin.intro.button.explore": "Explore {appName}",
  // END /admin/intro

  // /admin/users
  "admin.users.title": "User management",
  "admin.users.table.username": "Username",
  "admin.users.table.email": "Email",
  "admin.users.table.admin": "Admin",
  "admin.users.table.storageQuota": "Storage quota",
  "admin.users.table.maxShareSize": "Max transfer size",

  "admin.users.edit.update.title": "Edit user: {username}",
  "admin.users.edit.update.admin-privileges": "Admin privileges",
  "admin.users.edit.update.email-verified": "Email verified",
  "admin.users.edit.update.permanent-shares": "Permanent transfers",
  "admin.users.edit.update.permanent-shares.description":
    "Let this user create transfers that never expire, bypassing the global maximum expiration",
  "admin.users.edit.update.custom-share-size-limit": "Custom transfer size limit",
  "admin.users.edit.update.custom-share-size-limit.description":
    "Override the global upload limit for this user",
  "admin.users.edit.update.custom-storage-quota-limit": "Custom storage quota",
  "admin.users.edit.update.custom-storage-quota-limit.description":
    "Limit the user's total storage usage across active transfers",
  "admin.users.edit.update.change-password.title": "Change password",
  "admin.users.edit.update.change-password.field": "New password",
  "admin.users.edit.update.change-password.button": "Save new password",
  "admin.users.edit.update.trusted-devices.title": "Trusted devices",
  "admin.users.edit.update.notify.password.success":
    "Password changed successfully",

  "admin.users.edit.delete.title": "Delete user: {username} ?",
  "admin.users.edit.delete.description":
    "Do you really want to delete this user and all their transfers?",

  // showCreateUserModal.tsx
  "admin.users.modal.create.title": "Create user",
  "admin.users.modal.create.username": "Username",
  "admin.users.modal.create.email": "Email",
  "admin.users.modal.create.password": "Password",
  "admin.users.modal.create.manual-password": "Set password manually",
  "admin.users.modal.create.manual-password.description":
    "If not checked, the user will receive an email with a link to set their password.",
  "admin.users.modal.create.custom-share-size-limit": "Custom transfer size limit",
  "admin.users.modal.create.custom-share-size-limit.description":
    "Override the global upload limit for this user",
  "admin.users.modal.create.custom-storage-quota-limit": "Custom storage quota",
  "admin.users.modal.create.custom-storage-quota-limit.description":
    "Limit the user's total storage usage across active transfers",
  "admin.users.modal.create.admin": "Admin privileges",
  "admin.users.modal.create.admin.description":
    "If checked, the user will be able to access the admin panel.",

  // END /admin/users

  // /admin/shares
  "admin.shares.title": "Transfer management",
  "admin.shares.diskUsage": "Disk Usage",
  "admin.shares.table.id": "Transfer ID",
  "admin.shares.table.username": "Creator",
  "admin.shares.table.anonymous": "Anonymous",
  "admin.shares.table.visitors": "Visitors",
  "admin.shares.table.expires": "Expires on",
  "admin.shares.table.deletes": "Deletes on",

  "admin.shares.edit.delete.title": "Delete transfer: {id}",
  "admin.shares.edit.delete.description":
    "The link will stop working immediately. This action cannot be undone.",

  // END /admin/shares

  // /admin/brand
  "admin.brand.title": "Slideshow management",
  "admin.brand.project.enabledCount": "{enabled}/{total} shown",
  "admin.brand.still.enabled": "Shown",
  "admin.brand.project.enableAll": "Enable all",
  "admin.brand.project.disableAll": "Disable all",
  "admin.brand.notSynced.title": "Not synced yet",
  "admin.brand.notSynced.description":
    "No projects have been synced from majid.film yet. Run a sync to populate the slideshow.",
  "admin.brand.sync.button": "Sync now",
  "admin.brand.sync.enable": "Automatic sync",
  "admin.brand.sync.enable.description":
    "Checks nightly for new projects or images on majid.film.",
  "admin.brand.sync.notify.success":
    "Sync complete: {newProjects} new project(s), {newStills} new image(s)",
  "admin.brand.sync.notify.upToDate": "Already up to date, nothing new",
  // END /admin/brand

  // /upload
  "upload.title": "Upload",
  "upload.ogTitle": "Transfer - File Sharing Service",
  "upload.termsGate.perks.size": "Send up to {size} GB",
  "upload.termsGate.perks.free": "Free and secure",
  "upload.termsGate.perks.location": "Files stored in Réunion 🇷🇪",
  "upload.termsGate.perks.retention": "Keep your transfers for up to 30 days",
  "upload.termsGate.description": "By using {appName}, I accept the {termsLink}.",
  "upload.termsGate.accept": "I accept",

  "upload.notify.confirm-leave":
    "Are you sure you want to leave this page? Your upload will be canceled.",
  "upload.notify.generic-error":
    "An error occurred while finishing your transfer.",
  "upload.notify.count-failed":
    "{count} file(s) failed to upload after several attempts.",
  "upload.notify.cancelled": "Upload cancelled.",
  "upload.notify.duplicate-skipped": "Skipped duplicate file: {name}",
  "upload.reverse-share.error.invalid.title": "Invalid reverse share link",
  "upload.reverse-share.error.invalid.description":
    "This link has no remaining uses or is invalid.",

  // showEmailVerificationModal.tsx
  "upload.verification.title": "Verify your email",
  "upload.verification.email.description":
    "Enter your email to receive a one-time code before sharing.",
  "upload.verification.email.label": "Email",
  "upload.verification.email.button": "Send code",
  "upload.verification.code.description":
    "Enter the 6-digit code we sent to {email}.",
  "upload.verification.code.button": "Verify",
  "upload.verification.code.resend": "Resend code",
  "upload.verification.code.resend.cooldown": "Resend code ({seconds}s)",
  "upload.verification.code.change-email": "Use a different email",
  "upload.verification.notify.code-sent": "Code sent to {email}.",

  // TransferCard.tsx
  "upload.transfer.mode.email": "Email",
  "upload.transfer.mode.link": "Link",
  "upload.transfer.share-name.label": "Transfer name",
  "upload.transfer.name.default-multiple": "{count} files",
  "upload.transfer.name.default-generic": "New transfer",
  "upload.transfer.recipient.email.label": "Recipient's email",
  "upload.transfer.recipient.email.placeholder": "name@example.com",
  "upload.transfer.recipient.email.required":
    "Add at least one recipient, or switch back to Link mode.",
  "upload.transfer.sender.label": "Your email",
  "upload.transfer.sender.otp-description":
    "We'll send you a code to confirm the transfer.",
  "upload.transfer.sender.placeholder": "you@example.com",
  "upload.transfer.submit": "Transfer",
  "upload.transfer.submit.link": "Get a link",
  "upload.transfer.options": "Advanced options",
  "upload.transfer.message.label": "Message",
  "upload.transfer.expires.label": "Expiration (days)",
  "upload.transfer.expires.increase": "Increase expiration",
  "upload.transfer.expires.decrease": "Decrease expiration",

  // BrandPanel.tsx
  "upload.brand.caption": "{title}, {year}",
  "upload.brand.pause": "Pause the slideshow",
  "upload.brand.play": "Resume the slideshow",

  // Dropzone.tsx
  "upload.dropzone.title": "Upload files",
  "upload.dropzone.title.compact": "Add more files",
  "upload.dropzone.description":
    "Drag'n'drop files or folders here to start your transfer.\nUp to {maxSize}.",
  "upload.dropzone.description.mobile":
    "Select files or folders to start your transfer.\nUp to {maxSize}.",
  "upload.dropzone.notify.file-too-big":
    "Your files exceed the maximum transfer size of {maxSize}.",
  "upload.page-drop-overlay.title": "Drop your files anywhere",
  "upload.text-editor.title": "Editing {fileName}",
  "upload.button.folder": "Upload folder",
  "upload.button.folder.append": "Append folder",
  "upload.button.add": "Add to upload",

  // FileList.tsx
  "upload.filelist.name": "Name",
  "upload.filelist.size": "Size",
  "upload.filelist.estimating": "Estimating...",
  "upload.filelist.remaining": "{time} remaining",
  "upload.filelist.aggregate-progress": "{uploaded} of {total} uploaded",

  // NasImportBrowser.tsx / showNasImportModal.tsx — admin-only, see
  // share.enableNasImport
  "upload.nasImport.button": "Import from NAS",
  "upload.nasImport.browser.root": "NAS",
  "upload.nasImport.browser.empty": "This folder is empty",
  "upload.nasImport.modal.title": "Import from NAS",
  "upload.nasImport.modal.selected-count": "{count} selected",
  "upload.nasImport.modal.preview-button": "Preview",
  "upload.nasImport.modal.preview-result.singular": "{count} file, {size}",
  "upload.nasImport.modal.preview-result.plural": "{count} files, {size}",
  "upload.nasImport.modal.empty-selection": "The selection is empty",
  "upload.nasImport.notify.collisions":
    "{count} file(s) skipped (already in this transfer)",
  "upload.nasImport.progress.singular": "{done} / {total} file imported",
  "upload.nasImport.progress.plural": "{done} / {total} files imported",

  // TransferCard.tsx's own inline share-options form (name, recipients,
  // expiration, security) — shared by both a regular drag-and-drop upload
  // and a confirmed NAS import selection, not a modal despite the key
  // prefix.
  "upload.modal.title": "Create Transfer",
  "upload.modal.link.error.invalid":
    "Can only contain letters, numbers, underscores, and hyphens",
  "upload.modal.link.error.taken": "This link is already in use",
  "upload.modal.link.error.s3-session-not-found": "S3 upload session not found",
  "upload.modal.link.error.s3-etag-missing":
    "Missing ETag header in S3 response. Ensure CORS exposes the ETag header.",
  "upload.modal.not-signed-in": "You're not signed in",
  "upload.modal.not-signed-in-description":
    "You will be unable to delete your transfer manually and view the visitor count.",
  "upload.transfer.anonymous-notice":
    "Without an account, you won't be able to delete this transfer or see its view count after sending.",

  "upload.modal.expires.never": "never",
  "upload.modal.expires.never-long": "Permanent transfer",
  "upload.modal.expires.error.too-long":
    "Expiration date exceeds the maximum of {max}.",

  "upload.modal.link.label": "Link",
  "upload.modal.expires.label": "Expiration",
  "upload.modal.expires.minute-singular": "Minute",
  "upload.modal.expires.minute-plural": "Minutes",
  "upload.modal.expires.hour-singular": "Hour",
  "upload.modal.expires.hour-plural": "Hours",
  "upload.modal.expires.day-singular": "Day",
  "upload.modal.expires.day-plural": "Days",
  "upload.modal.expires.week-singular": "Week",
  "upload.modal.expires.week-plural": "Weeks",
  "upload.modal.expires.month-singular": "Month",
  "upload.modal.expires.month-plural": "Months",
  "upload.modal.expires.year-singular": "Year",
  "upload.modal.expires.year-plural": "Years",

  "upload.modal.accordion.name-and-description.title": "Name and description",
  "upload.modal.accordion.description-only.title": "Description",
  "upload.modal.accordion.name-and-description.name.placeholder": "Name",
  "upload.modal.accordion.name-and-description.description.placeholder":
    "Note for the recipients of this transfer",

  "upload.modal.accordion.email.title": "Email recipients",
  "upload.modal.accordion.email.placeholder": "Enter email recipients",
  "upload.modal.accordion.email.invalid-email": "Invalid email address",
  "upload.modal.accordion.email.restrict-to-recipients":
    "Restrict access to these recipients only (they must sign in to access it)",

  "upload.modal.accordion.security.title": "Security options",
  "upload.modal.accordion.security.password.label": "Password protection",
  "upload.modal.accordion.security.password.placeholder": "No password",
  "upload.modal.accordion.security.max-views.label": "Maximum views",
  "upload.modal.accordion.security.max-views.placeholder": "No limit",
  "upload.modal.accordion.security.max-views.increase": "Increase maximum views",
  "upload.modal.accordion.security.max-views.decrease": "Decrease maximum views",

  // showCompletedUploadModal.tsx
  "upload.modal.completed.never-expires": "This transfer will never expire.",
  "upload.modal.completed.expires-on":
    "This transfer will expire on {expiration}.",
  // Detailed variant, for the success modal only — see the French entry.
  "upload.modal.completed.expires-detail":
    "This transfer will expire {relative}, on {date} at {time}.",
  // A moment format token, not prose — see the French entry.
  "upload.modal.completed.expires-time-format": "LT",
  "upload.modal.completed.create-account":
    "Create an account to keep track of your links",
  // Two pairs, and the share picks one: "ready" while the link still waits
  // for its sender to pass it on, "sent" once mail has actually gone out.
  // Different moments, not two ways of saying the same thing.
  "upload.modal.completed.ready": "Your transfer is ready!",
  "upload.modal.completed.ready-named": "“{name}” is ready!",
  "upload.modal.completed.sent": "All done!",
  "upload.modal.completed.sent-named": "“{name}” is on its way!",
  "upload.modal.completed.link-mode.download-notification":
    "We'll email you as soon as this transfer gets downloaded.",
  "upload.modal.completed.email-mode.recipients-notified":
    "We've emailed this transfer to your recipients.",
  "upload.modal.completed.summary.singular": "{count} file · {size}",
  "upload.modal.completed.summary.plural": "{count} files · {size}",
  "upload.modal.completed.notified-reverse-share-creator":
    "We have notified the creator of the reverse share. You can also manually share this link with them through other means.",
  "upload.modal.completed.sender-emailed":
    "We also sent this link to your email, just in case.",

  // END /upload

  // /share/[id]
  "share.title": "Transfer {shareId}",
  "share.description": "Look what I've shared with you!",
  "share.fileCount":
    "{count, plural, =1 {# file} other {# files}} · {size} (zip file may be smaller due to compression)",
  "share.copy-text-contents": "Copy file contents to clipboard",
  "share.error.visitor-limit-exceeded.title": "Visitor limit exceeded",
  "share.error.visitor-limit-exceeded.description":
    "The visitor limit from this transfer has been exceeded.",
  "share.error.removed.title": "Transfer removed",
  "share.error.not-found.title": "Transfer not found",
  "share.error.not-found.description":
    "The transfer you're looking for doesn't exist.",
  "share.error.access-denied.title": "Private transfer",
  "share.error.access-denied.description":
    "The current account does not have permission to access this transfer",
  "share.error.restricted.title": "Restricted transfer",
  "share.error.restricted.description":
    "This transfer is restricted to specific recipients. Please log in to access it.",
  "share.error.restricted.button": "Log in",

  "share.modal.password.title": "Password required",
  "share.modal.password.description":
    "Please enter the password to access this transfer.",
  "share.modal.password": "Password",
  "share.modal.error.invalid-password": "Invalid password",

  "share.button.download-all": "Download all",
  "share.button.edit-details": "Edit details",
  "share.notify.download-all-preparing":
    "The transfer is being prepared. Please try again in a few minutes.",
  "share.notify.download-all-failed": "The download failed. Please try again.",

  "share.notify.copied-contents": "File contents copied to clipboard",
  "share.notify.copy-too-big-error": "File is too big to copy to clipboard",
  "share.notify.copy-not-supported-error":
    "Copying to clipboard requires a HTTPS connection",

  "share.table.name": "Name",
  "share.table.size": "Size",
  "share.table.sort-ascending": "Sort by {label} (ascending)",
  "share.table.sort-descending": "Sort by {label} (descending)",

  "share.modal.file-preview.error.not-supported.title": "Preview not supported",
  "share.modal.file-preview.error.not-supported.description":
    "Previews are not supported for this type of files. Please download the file to view it.",
  "share.modal.file-preview.view-original": "View original file",

  // END /share/[id]

  // /share/[id]/edit
  "share.edit.title": "Edit {shareId}",
  "share.edit.append-upload": "Append file",
  "share.edit.notify.generic-error":
    "An error occurred while finishing your transfer.",
  "share.edit.notify.save-success": "Transfer updated successfully",
  // END /share/[id]/edit

  // /share/[id]/downloads
  "share.downloads.title": "Download history for {shareId}",
  "share.downloads.table.date": "Date",
  "share.downloads.table.file": "File",
  "share.downloads.table.recipient": "Downloaded by",
  "share.downloads.table.ip": "IP address",
  "share.downloads.table.whole-archive": "Whole transfer (zip)",
  "share.downloads.table.anonymous": "Anonymous",
  "share.downloads.empty.title": "No downloads yet",
  "share.downloads.empty.description":
    "Nobody has downloaded this transfer yet.",
  "share.downloads.error.access-denied.title": "Access denied",
  "share.downloads.error.access-denied.description":
    "You don't have permission to view this transfer's download history.",
  // END /share/[id]/downloads

  // CookieNotice.tsx - shown site-wide, not tied to one page
  "cookieNotice.text":
    "This site only uses cookies necessary for it to work — no advertising or tracking cookies. {privacyLink}",
  "cookieNotice.dismiss": "Close",

  // Footer only — short forms of the three legal page titles below, which stay
  // full everywhere else. See the note on these keys in fr-FR.ts for why the
  // footer needs them short (it is a measured height constraint, not taste).
  "footer.legal.imprint": "Imprint",
  "footer.legal.terms": "Terms",
  "footer.legal.privacy": "Privacy",

  // /imprint
  "imprint.title": "Imprint",
  // END /imprint

  // /terms
  "terms.title": "Terms of Use",
  // END /terms

  // /privacy
  "privacy.title": "Privacy Policy",
  // END /privacy

  // /contact
  "contact.heading": "Have a question?",
  "contact.input.subject": "Subject",
  "contact.input.message": "Message",
  "contact.button.send": "Send",
  "contact.button.send-another": "Send another message",
  "contact.notify.success": "Your message has been sent",
  // END /contact

  // /admin/config
  "admin.password-gate.title": "Set a password to continue",
  "admin.password-gate.description":
    "Your admin account has no password: it only signs in through the identity provider.",
  "admin.password-gate.why.title": "Why now",
  "admin.password-gate.why.description":
    "The day the provider is unavailable, this console is the very thing you would use to repair it — and you would have no other way in. This password is that other way. It does not replace the provider; it only matters if the provider is down.",
  "admin.password-gate.password": "Password",
  "admin.password-gate.confirmation": "Confirmation",
  "admin.password-gate.error.mismatch": "The two passwords do not match",
  "admin.password-gate.submit": "Set it and continue",
  "admin.config.file-sync.dismiss": "Don't show this again",
  "admin.config.config-file-sync.title": "Synced with config.yaml",
  "admin.config.config-file-sync.description":
    "A config.yaml file is mounted on this instance. Changes made here are also written to the file, and the other way around — both stay in sync.",
  "admin.config.secrets-file-sync.title": "Synced with secrets.env",
  "admin.config.secrets-file-sync.description":
    "A secrets.env file is mounted on this instance. Secret fields below are also written to it, and the other way around — both stay in sync, kept separate from config.yaml so it can be permissioned tighter.",
  "admin.config.file-sync-failed.title": "Failed to sync to file",
  "admin.config.file-sync-failed.description":
    "The changes below are saved and active, but could not be written to the file mounted on disk — on the next restart, that file will win and this change will be lost. Check its permissions, then save again here to force a fresh write. Technical detail: {error}",
  "admin.config.title": "Configuration",
  "admin.config.category.general": "General",
  "admin.config.category.share": "Transfer",
  "admin.config.category.verification": "Verification",
  "admin.config.category.cache": "Cache",
  "admin.config.category.clamav": "ClamAV",
  "admin.config.category.performance": "Performance",
  "admin.config.category.email": "Email",
  "admin.config.category.smtp": "SMTP",
  "admin.config.category.oauth": "Social Login",
  "admin.config.general.default-language": "Default Language",
  "admin.config.general.default-language.description":
    "This applies to all users, each user can still personalise their language in their profile.",
  "admin.config.general.app-url": "App URL",
  "admin.config.general.app-url.description":
    "On which URL the app is available",
  "admin.config.general.secure-cookies": "Secure cookies",
  "admin.config.general.secure-cookies.description":
    "Whether to set the secure flag on cookies. If enabled, the site will not function when accessed over HTTP.",
  "admin.config.general.session-duration": "Session Duration",
  "admin.config.general.session-duration.description":
    "Time after which a user must log in again (default: 3 months).",
  "admin.config.general.version-check-token": "Version Check Token",
  "admin.config.general.version-check-token.description":
    "GitHub personal access token (read-only, restricted to this repository) used to show a status dot in the sidebar: green if this install is the newest published release, orange if a newer one exists, yellow if it is current but unreleased commits are waiting on main — hover for the count. The repository being private, leaving this empty simply disables the dot.",
  "admin.version.upToDate": "You're up to date",
  "admin.version.outdated": "New version available: {0}",
  "admin.version.drift":
    "Up to date, but {count, plural, =1 {# unreleased commit} other {# unreleased commits}} on main since {tag}",
  "admin.config.clamav.enabled": "Scan uploads with ClamAV",
  "admin.config.clamav.enabled.description":
    "Scan every uploaded transfer for malicious files before keeping it. Infected transfers are deleted automatically. Requires a reachable ClamAV instance (see the integrations docs).",
  "admin.config.clamav.infected-file-action": "Infected file action",
  "admin.config.clamav.infected-file-action.description":
    "What happens to a transfer ClamAV flags as containing a malicious file: permanently deleted, set aside for review, or left as-is (the transfer stays fully accessible — ClamAV only records the detection in the scan history).",
  "admin.config.clamav.infected-file-action.delete": "Delete",
  "admin.config.clamav.infected-file-action.quarantine": "Quarantine",
  "admin.config.clamav.infected-file-action.none": "Do nothing",

  // Performance
  "admin.config.performance.pause-glint-on-card-resize":
    "Pause the card's glint while it resizes",
  "admin.config.performance.pause-glint-on-card-resize.description":
    "On mobile, briefly hides the light that travels around the card's edge while the card is changing height — when the advanced options open, for instance. Measured on an iPhone 14 Pro: 36ms between painted frames without it, 17ms with it, which is the difference between a stuttering animation and a smooth one. The light resumes exactly where it left off, but its absence is still noticeable: turn this off if you would rather keep the light continuous than the animation smooth. No effect on desktop, where the card does not change height.",
  "admin.clamav.status.title": "ClamAV status",
  "admin.clamav.status.connected": "Connected",
  "admin.clamav.status.disconnected": "Not connected",
  "admin.clamav.status.database": "Virus database: v{revision} · updated {date}",
  "admin.clamav.status.database.stale":
    "Not updated in {days} days — check that ClamAV can reach its update mirrors.",
  "admin.clamav.scans.title": "Scan history",
  "admin.clamav.scans.empty": "No scans yet.",
  "admin.clamav.scans.column.date": "Date",
  "admin.clamav.scans.column.share": "Transfer",
  "admin.clamav.scans.column.files": "Files",
  "admin.clamav.scans.column.status": "Status",
  "admin.clamav.scans.column.action": "Action",
  "admin.clamav.scans.status.clean": "Clean",
  "admin.clamav.scans.status.infected": "Infected",
  "admin.clamav.scans.status.error": "Error",
  "admin.clamav.scans.action.delete": "Deleted",
  "admin.clamav.scans.action.quarantine": "Quarantined",
  "admin.clamav.scans.action.none": "No action taken",
  "admin.config.cache.ttl": "TTL",
  "admin.config.cache.ttl.description":
    "Time in second to keep information inside the cache.",
  "admin.config.cache.max-items": "Maximum items",
  "admin.config.cache.max-items.description":
    "Maximum number of items inside the cache.",
  "admin.config.cache.redis-enabled": "Redis enabled",
  "admin.config.cache.redis-enabled.description":
    "Normally the app caches information in memory. If you run multiple instances, you need to enable Redis caching to share the cache between the instances.",
  "admin.config.cache.redis-url": "Redis URL",
  "admin.config.cache.redis-url.description":
    "Url to connect to the Redis instance used for caching.",
  "admin.config.cache.button.test-redis": "Test Redis connection",
  "admin.config.cache.test-redis.success": "Connected to Redis successfully",
  "admin.config.cache.test-redis.success-disabled":
    "Connected to Redis successfully (Redis caching is currently disabled).",
  "admin.config.cache.test-redis.modal.error.title":
    "Failed to connect to Redis",
  "admin.config.cache.test-redis.modal.error.description":
    "While connecting to Redis, the following error occurred:",
  "admin.config.cache.test-redis.modal.save.title": "Save configuration",
  "admin.config.cache.test-redis.modal.save.description":
    "To continue you need to save the configuration first. Do you want to save the configuration and test the Redis connection?",
  "admin.config.cache.test-redis.modal.save.confirm": "Save and test",
  "admin.config.verification.code-expiration": "Code lifetime",
  "admin.config.verification.code-expiration.description":
    "How long a verification code stays valid before a new one has to be requested. The email carrying the code states this duration itself, so changing it here changes both.",
  "admin.config.email.send-html-emails": "Enable HTML email compatibility",
  "admin.config.email.send-html-emails.description":
    "If enabled, emails will be sent in HTML format. Ensure email templates are updated to use HTML.",
  "admin.config.email.enable-share-email-recipients":
    "Enable email recipient sharing",
  "admin.config.email.enable-share-email-recipients.description":
    "Whether to allow email sharing with recipients. This can only be enabled if SMTP is activated.",
  "admin.config.email.enable-share-download-notifications":
    "Enable download notifications",
  "admin.config.email.enable-share-download-notifications.description":
    "Whether to send an email to the transfer's creator or sender when a file is downloaded. Requires SMTP.",
  "admin.config.email.enable-new-account-notifications":
    "Notify on new accounts",
  "admin.config.email.enable-new-account-notifications.description":
    "Whether to send an email to transfer@majid.film when a new account signs up. Requires SMTP.",
  "admin.config.email.enable-expiring-sender-notification":
    "Notify before expiry (sender)",
  "admin.config.email.enable-expiring-sender-notification.description":
    "Whether to notify a transfer's creator or sender when it's about to expire. Each user can turn this off from their own account.",
  "admin.config.email.expiring-sender-notification-window":
    "Expiry notice window (sender)",
  "admin.config.email.expiring-sender-notification-window.description":
    "How long before a transfer expires to notify its creator or sender.",
  "admin.config.email.enable-expiring-recipient-notification":
    "Notify before expiry (recipient)",
  "admin.config.email.enable-expiring-recipient-notification.description":
    "Whether to notify a named recipient (Email mode) who hasn't downloaded a transfer yet when it's about to expire. Requires email recipient sharing to be enabled.",
  "admin.config.email.expiring-recipient-notification-window":
    "Expiry notice window (recipient)",
  "admin.config.email.expiring-recipient-notification-window.description":
    "How long before a transfer expires to notify a recipient who hasn't downloaded it yet.",
  "admin.config.email.enable-email-verification": "Enable email verification",
  "admin.config.email.enable-email-verification.description":
    "Whether to require users to verify their email address before being able to sign in. This can only be enabled if SMTP is activated.",
  "admin.config.share.allow-registration": "Allow registration",
  "admin.config.share.allow-registration.description":
    "Whether registration is allowed",
  "admin.config.share.allow-unauthenticated-shares":
    "Allow unauthenticated transfers",
  "admin.config.share.allow-unauthenticated-shares.description":
    "Lets signed-out visitors create transfers and makes the site public. Off, the site requires signing in for everything, including the home page.",
  "admin.config.share.require-email-verification-for-anonymous-shares":
    "Email verification for anonymous transfers",
  "admin.config.share.require-email-verification-for-anonymous-shares.description":
    "Requires entering a code sent by email before a signed-out visitor can send a transfer. Requires SMTP to be enabled.",
  "admin.config.share.default-expiration": "Default expiration",
  "admin.config.share.default-expiration.description":
    "The default expiration time selected when creating a new transfer.",
  "admin.config.share.max-expiration": "Max expiration",
  "admin.config.share.max-expiration.description":
    "Maximum transfer expiration. Set to 0 to allow unlimited expiration.",
  "admin.config.share.share-id-length": "Default transfer ID length",
  "admin.config.share.share-id-length.description":
    "Default length for the generated ID of a transfer. This value is also used to generate links for reverse shares. A value below 8 is not considered secure.",
  "admin.config.share.max-size": "Max size",
  "admin.config.share.max-size.description": "Maximum transfer size",
  "admin.config.share.zip-compression-level": "Zip compression level",
  "admin.config.share.zip-compression-level.description":
    "Adjust the level to balance between file size and compression speed. Valid values range from 0 to 9, with 0 being no compression and 9 being maximum compression. ",
  "admin.config.share.chunk-size": "Chunk size",
  "admin.config.share.chunk-size.description":
    "Adjust the chunk size for your uploads to balance efficiency and reliability according to your internet connection. Smaller chunks can enhance success rates for unstable connections, while larger chunks make uploads faster for stable connections.",
  "admin.config.share.allow-admin-access-all-shares":
    "Allow admin access to all transfers",
  "admin.config.share.allow-admin-access-all-shares.description":
    "Allow administrators to access all transfers, even if they are password protected, expired or deleted.",
  "admin.config.share.enable-user-recipients":
    "Enable sharing with registered users",
  "admin.config.share.enable-user-recipients.description":
    "When enabled, transfers sent to a registered user's email address will automatically appear in their account. Users can also restrict transfer access to named recipients only.",
  "admin.config.share.enable-nas-import": "Enable NAS import",
  "admin.config.share.enable-nas-import.description":
    "Lets an administrator create a transfer from files already on the NAS, without duplicating their content. Also requires the NAS_IMPORT_ROOT environment variable to be set to a mounted directory.",
  "admin.config.share.enable-video-thumbnails": "Enable video thumbnails",
  "admin.config.share.enable-video-thumbnails.description":
    "Generates a small poster-frame thumbnail for video files in a transfer, shown next to the file name in the file list.",
  "admin.config.share.enable-video-range-requests":
    "Enable scrubbable video/audio preview",
  "admin.config.share.enable-video-range-requests.description":
    "Lets the inline preview player seek instantly to any point in a local video or audio file instead of streaming from the start. Has no effect on S3-backed transfers, which already support this natively.",
  "admin.config.share.file-retention-period": "File retention period",
  "admin.config.share.file-retention-period.description":
    "How long files are kept after a transfer expires or gets deleted. Only useful if the 'Allow admin access to all transfers' is also enabled. Set to -1 to keep files forever.",
  "admin.config.smtp.enabled": "Enable",
  "admin.config.smtp.enabled.description":
    "Whether SMTP is enabled. Only set this to true if you entered the host, port, email, user and password of your SMTP server.",
  "admin.config.smtp.host": "Host",
  "admin.config.smtp.host.description": "Host of the SMTP server",
  "admin.config.smtp.port": "Port",
  "admin.config.smtp.port.description": "Port of the SMTP server",
  "admin.config.smtp.email": "Email",
  "admin.config.smtp.email.description":
    "Email address from which the emails get sent",
  "admin.config.smtp.username": "Username",
  "admin.config.smtp.username.description": "Username of the SMTP server",
  "admin.config.smtp.password": "Password",
  "admin.config.smtp.password.description": "Password of the SMTP server",
  "admin.config.smtp.button.test": "Send test email",
  "admin.config.smtp.test-email.success": "Email sent successfully",
  "admin.config.smtp.test-email.error.title": "Failed to send email",
  "admin.config.smtp.test-email.error.description":
    "While sending the test email, the following error occurred:",
  "admin.config.smtp.test-email.save.title": "Save configuration",
  "admin.config.smtp.test-email.save.description":
    "To continue you need to save the configuration first. Do you want to save the configuration and send the test email?",
  "admin.config.smtp.test-email.save.confirm": "Save and send",
  "admin.config.smtp.allow-unauthorized-certificates":
    "Trust unauthorized SMTP server certificates",
  "admin.config.smtp.allow-unauthorized-certificates.description":
    "Only set this to true if you need to trust self signed certificates.",
  "admin.config.oauth.allow-registration": "Allow registration",
  "admin.config.oauth.allow-registration.description":
    "Allow users to register via social login",
  "admin.config.oauth.ignore-totp": "Ignore two-factor authentication",
  "admin.config.oauth.ignore-totp.description":
    "Whether to ignore two-factor authentication when user using social login",
  "admin.config.oauth.disable-password": "Disable password login",
  "admin.config.oauth.disable-password.description":
    "Whether to disable password login\nMake sure that an OAuth provider is properly configured before activating this configuration to avoid being locked out.",
  "admin.config.oauth.github-enabled": "GitHub",
  "admin.config.oauth.github-enabled.description":
    "Whether GitHub login is enabled",
  "admin.config.oauth.github-client-id": "GitHub Client ID",
  "admin.config.oauth.github-client-id.description":
    "Client ID of the GitHub OAuth app",
  "admin.config.oauth.github-client-secret": "GitHub Client secret",
  "admin.config.oauth.github-client-secret.description":
    "Client secret of the GitHub OAuth app",
  "admin.config.oauth.google-enabled": "Google",
  "admin.config.oauth.google-enabled.description":
    "Whether Google login is enabled",
  "admin.config.oauth.google-client-id": "Google Client ID",
  "admin.config.oauth.google-client-id.description":
    "Client ID of the Google OAuth app",
  "admin.config.oauth.google-client-secret": "Google Client secret",
  "admin.config.oauth.google-client-secret.description":
    "Client secret of the Google OAuth app",
  "admin.config.oauth.microsoft-enabled": "Microsoft",
  "admin.config.oauth.microsoft-enabled.description":
    "Whether Microsoft login is enabled",
  "admin.config.oauth.microsoft-tenant": "Microsoft Tenant",
  "admin.config.oauth.microsoft-tenant.description":
    "Tenant ID of the Microsoft OAuth app\ncommon: Users with both a personal Microsoft account and a work or school account from Microsoft Entra ID can sign in to the application. organizations: Only users with work or school accounts from Microsoft Entra ID can sign in to the application.\nconsumers: Only users with a personal Microsoft account can sign in to the application.\ndomain name of the Microsoft Entra tenant or the tenant ID in GUID format: Only users from a specific Microsoft Entra tenant (directory members with a work or school account or directory guests with a personal Microsoft account) can sign in to the application.",
  "admin.config.oauth.microsoft-client-id": "Microsoft Client ID",
  "admin.config.oauth.microsoft-client-id.description":
    "Client ID of the Microsoft OAuth app",
  "admin.config.oauth.microsoft-client-secret": "Microsoft Client secret",
  "admin.config.oauth.microsoft-client-secret.description":
    "Client secret of the Microsoft OAuth app",
  "admin.config.oauth.discord-enabled": "Discord",
  "admin.config.oauth.discord-enabled.description":
    "Whether Discord login is enabled",
  "admin.config.oauth.discord-limited-users": "Discord limited users",
  "admin.config.oauth.discord-limited-users.description":
    "Limit signing in to specific users by their Discord ID. Leave it blank to disable.",
  "admin.config.oauth.discord-limited-guild": "Discord limited server ID",
  "admin.config.oauth.discord-limited-guild.description":
    "Limit signing in to users in a specific server. Leave it blank to disable.",
  "admin.config.oauth.discord-client-id": "Discord Client ID",
  "admin.config.oauth.discord-client-id.description":
    "Client ID of the Discord OAuth app",
  "admin.config.oauth.discord-client-secret": "Discord Client secret",
  "admin.config.oauth.discord-client-secret.description":
    "Client secret of the Discord OAuth app",
  "admin.config.oauth.oidc-enabled": "OpenID Connect",
  "admin.config.oauth.oidc-enabled.description":
    "Whether OpenID Connect login is enabled",
  "admin.config.oauth.oidc-discovery-uri": "OpenID Connect Discovery URI",
  "admin.config.oauth.oidc-discovery-uri.description":
    "Discovery URI of the OpenID Connect OAuth app",
  "admin.config.oauth.oidc-sign-up-url": "OpenID Connect sign-up URL",
  "admin.config.oauth.oidc-sign-up-url.description":
    "Direct URL to the OpenID provider's own sign-up page (optional). When set, the “Sign up with OpenID” button opens it in a new tab instead of going through the standard sign-in flow, which sometimes has no sign-up option.",
  "admin.config.oauth.oidc-sign-out": "Sign out from OpenID Connect",
  "admin.config.oauth.oidc-sign-out.description":
    "Whether the “Sign out” button will sign out from the OpenID Connect provider",
  "admin.config.oauth.oidc-scope": "OpenID Connect scope",
  "admin.config.oauth.oidc-scope.description":
    "Scopes which should be requested from the OpenID Connect provider.",
  "admin.config.oauth.oidc-username-claim": "OpenID Connect username claim",
  "admin.config.oauth.oidc-username-claim.description":
    "Username claim in OpenID Connect ID token. Leave it blank if you don't know what this config is.",
  "admin.config.oauth.oidc-role-path": "Path to roles in OpenID Connect token",
  "admin.config.oauth.oidc-role-path.description":
    "Must be a valid JMES path referencing an array of roles. " +
    "Managing access rights using OpenID Connect roles is only recommended if no other identity provider is configured and password login is disabled. " +
    "Leave it blank if you don't know what this config is.",
  "admin.config.oauth.oidc-role-general-access":
    "OpenID Connect role for general access",
  "admin.config.oauth.oidc-role-general-access.description":
    "Role required for general access. Must be present in a user’s roles for them to log in. " +
    "Leave it blank if you don't know what this config is.",
  "admin.config.oauth.oidc-role-admin-access":
    "OpenID Connect role for admin access",
  "admin.config.oauth.oidc-role-admin-access.description":
    "Role required for administrative access. Must be present in a user’s roles for them to access the admin panel. " +
    "Leave it blank if you don't know what this config is.",
  "admin.config.oauth.oidc-client-id": "OpenID Connect Client ID",
  "admin.config.oauth.oidc-client-id.description":
    "Client ID of the OpenID Connect OAuth app",
  "admin.config.oauth.oidc-client-secret": "OpenID Connect Client secret",
  "admin.config.oauth.oidc-client-secret.description":
    "Client secret of the OpenID Connect OAuth app",
  "admin.config.category.ldap": "LDAP",
  "admin.config.ldap.enabled": "Enable LDAP",
  "admin.config.ldap.enabled.description":
    "Use LDAP authentication for user login",
  "admin.config.ldap.url": "Server URL",
  "admin.config.ldap.url.description": "URL of the LDAP server",
  "admin.config.ldap.bind-dn": "Bind DN",
  "admin.config.ldap.bind-dn.description":
    "Default user used to perform the user search",
  "admin.config.ldap.bind-password": "Bind password",
  "admin.config.ldap.bind-password.description":
    "Password used to perform the user search",
  "admin.config.ldap.search-base": "User base",
  "admin.config.ldap.search-base.description":
    "Base location, where the user search will be performed",
  "admin.config.ldap.search-query": "User query",
  "admin.config.ldap.search-query.description":
    "The user query will be used to search the 'User base' for the LDAP user. %username% can be used as the placeholder for the user given input.",
  "admin.config.ldap.admin-groups": "Admin group",
  "admin.config.ldap.admin-groups.description":
    "Group required for administrative access.",
  "admin.config.ldap.field-name-member-of": "User groups attribute name",
  "admin.config.ldap.field-name-member-of.description":
    "LDAP attribute name for the groups, an user is a member of. This is used when checking for the admin group.",
  "admin.config.ldap.field-name-email": "User email attribute name",
  "admin.config.ldap.field-name-email.description":
    "LDAP attribute name for the email of an user.",
  "admin.config.notify.success": "Configuration updated successfully.",
  "admin.config.notify.no-changes": "No changes to save.",
  "admin.config.category.s3": "S3",
  "admin.config.s3.enabled": "Enabled",
  "admin.config.s3.enabled.description":
    "Whether S3 should be used to store the shared files instead of the local file system. WARNING: If ClamAV is active, files will be temporarily downloaded from S3 to be checked.",
  "admin.config.s3.endpoint": "Endpoint",
  "admin.config.s3.endpoint.description": "The URL of the S3 bucket.",
  "admin.config.s3.region": "Region",
  "admin.config.s3.region.description": "The region of the S3 bucket.",
  "admin.config.s3.bucket-name": "Bucket name",
  "admin.config.s3.bucket-name.description": "The name of the S3 bucket.",
  "admin.config.s3.bucket-path": "Path",
  "admin.config.s3.bucket-path.description":
    "The default path which should be used to store the files in the S3 bucket.",
  "admin.config.s3.key": "Key",
  "admin.config.s3.key.description":
    "The key which allows you to access the S3 bucket.",
  "admin.config.s3.secret": "Secret",
  "admin.config.s3.secret.description":
    "The secret which allows you to access the S3 bucket.",
  "admin.config.s3.use-checksum": "Use checksum",
  "admin.config.s3.use-checksum.description":
    "Turn off for backends that do not support checksum (e.g. B2).",
  "admin.config.s3.docs-link":
    "CORS must be reconfigured on your bucket, see the {wikiLink} for details.",
  "admin.config.category.legal": "Legal",
  "admin.config.legal.enabled": "Enable legal notices",
  "admin.config.legal.enabled.description":
    "Whether to show a link to the imprint, terms of use, and privacy policy in the footer.",
  "admin.config.legal.imprint-text": "Imprint text",
  "admin.config.legal.imprint-text.description":
    "The text which should be shown in the imprint. Supports Markdown.",
  "admin.config.legal.terms-text": "Terms of use text",
  "admin.config.legal.terms-text.description":
    "The text which should be shown in the terms of use. Supports Markdown.",
  "admin.config.legal.privacy-policy-text": "Privacy policy text",
  "admin.config.legal.privacy-policy-text.description":
    "The text which should be shown in the privacy policy. Supports Markdown.",
  "admin.config.legal.editor.markdown-label": "Markdown",
  "admin.config.legal.editor.preview-label": "Preview",
  "admin.config.legal.editor.preview-empty": "Nothing to preview yet.",

  // 404
  "404.description": "Oops this page doesn't exist.",
  "404.button.home": "Bring me back home",

  // error
  "error.title": "Error",
  "error.description": "Oops!",
  "error.button.back": "Go back",
  "error.msg.default": "Something went wrong.",
  "error.msg.access_denied":
    "You canceled the authentication process, please try again.",
  "error.msg.expired_token":
    "The authentication process took too long, please try again.",
  "error.msg.invalid_token": "Internal Error",
  "error.msg.no_user": "User linked to this {0} account doesn't exist.",
  "error.msg.no_email": "Can't get email address from this {0} account.",
  "error.msg.already_linked":
    "This {0} account is already linked to another account.",
  "error.msg.not_linked":
    "This {0} account hasn't been linked to any account yet.",
  "error.msg.email_already_exists":
    "An account with this email address already exists. Please sign in with your password and manually link your {0} account in your My Account page.",
  "error.msg.email_not_verified":
    "Your email address on this {0} account is not verified. Please verify your email with your identity provider before signing in.",
  "error.msg.unverified_account":
    "This {0} account is unverified, please try again after verification.",
  "error.msg.user_not_allowed": "You are not allowed to sign in.",
  "error.msg.cannot_get_user_info":
    "Cannot get your user info from this {0} account.",
  "error.param.provider_github": "GitHub",
  "error.param.provider_google": "Google",
  "error.param.provider_microsoft": "Microsoft",
  "error.param.provider_discord": "Discord",
  "error.param.provider_oidc": "OpenID Connect",

  // Common translations
  "common.button.info": "Info",
  "common.button.undo": "Undo",
  "common.button.retry": "Retry",
  "common.button.download": "Download",
  "common.button.copy": "Copy",
  "common.button.copy-link": "Copy link",
  "common.button.preview": "Preview",
  "common.button.edit": "Edit",
  "common.button.profile": "Profile",
  "common.badge.ldap": "LDAP",
  "common.button.shares": "Transfers",
  "common.button.save": "Save",
  "common.button.create": "Create",
  "common.button.submit": "Submit",
  "common.button.delete": "Delete",
  "common.button.cancel": "Cancel",
  "common.button.close": "Close",
  "common.button.refresh": "Refresh",
  "common.button.confirm": "Confirm",
  "common.button.disable": "Disable",
  "common.button.share": "Transfer",
  "common.button.generate": "Generate",
  "common.button.done": "Done",
  "common.button.menu": "Menu",
  "common.button.back": "Back",
  "common.button.toggle-password-visibility": "Show/hide password",
  "common.text.link": "Link",
  "common.text.navigate-to-link": "Visit link",
  "common.text.or": "or",
  "common.text.redirecting": "Redirecting...",
  "common.button.go-back": "Go back",
  "common.button.go-home": "Go home",
  "common.notify.copied": "Your link was copied to the clipboard",
  "common.notify.copied-link": "Your link was copied to the clipboard",
  "common.success": "Success",

  "common.error": "Error",
  "common.error.unknown": "An unknown error occurred",
  "common.error.invalid-email": "Invalid email address",
  "common.error.too-short": "Must be at least {length} characters",
  "common.error.too-long": "Must be at most {length} characters",
  "common.error.number-too-small": "Must be at least {min}",
  "common.error.number-too-large": "Must be at most {max}",
  "common.error.exact-length": "Must be exactly {length} characters",
  "common.error.invalid-number": "Must be a number",
  "common.error.field-required": "This field is required",
  "common.error.passwords-dont-match": "Passwords don't match",

  "admin.notice.modal.headerTag": "ADMINISTRATIVE ACTION REQUIRED",
  "admin.notice.modal.defaultCheckboxLabel":
    "I confirm that I have read this notice and understand the breaking changes.",
  "admin.notice.modal.button.acknowledge": "Acknowledge & Dismiss",
  "admin.notice.modal.button.acknowledging": "Acknowledging...",
  "admin.notice.modal.docsLink": "View Documentation",
  "admin.notice.modal.globalNoticeFooter":
    "Note: Once acknowledged, this notice will be permanently dismissed for all administrators across all devices.",
};
