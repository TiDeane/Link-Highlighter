# Link Highlighter

Just a simple extension that highlights all links opened while the extension was toggled on. Made with Linkedin in mind.

#### Works on [Firefox](https://addons.mozilla.org/en-US/firefox/addon/url-highlighter/) and Chrome (no official page on Chrome yet).

---

### URL Normalization

For this to work on Linkedin, it was necessary to normalize URLs and strip query parameters and hash fragments. This normalization leads to results that aren't ideal in other websites (e.g. upon clicking a Github profile link, it also highlights URLs with queries like "?tab=repositories" or "?tab=achievements" inside that profile).

### Plans for future updates:

- Make popup prettier
- Add option to customize URL normalization
