# Link Highlighter

Just a simple Firefox addon that highlights all links opened while the extension was toggled on. Made with Linkedin in mind.

For this to work on Linkedin, it was necessary to normalize URLs and strip query parameters and hash fragments. This normalization leads to results that aren't ideal in other websites (e.g. upon clicking a Github profile link, it also highlights URLs with queries like "?tab=repositories" or "?tab=achievements" inside that profile).

### Planned future updates:

- Port to Chrome (in progress)
- Make popup prettier
- Add option to customize URL normalization
