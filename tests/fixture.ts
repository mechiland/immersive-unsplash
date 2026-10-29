// A small, synthetic fixture of the semantic/structural contract observed on
// Unsplash on 2026-10-29. No account data or photo content is copied.
export function browsingFixture() {
  return `<div id="site"><div id="layout"><nav id="sidebar">
    <div><div><a title="Home — Unsplash" href="/"><svg><title>Unsplash Home</title></svg></a>
    <a aria-label="Photos" href="/"><svg></svg></a><a aria-label="Illustrations" href="/illustrations"><svg></svg></a></div>
    <div><a aria-label="Collections" href="/@fixture/collections"><svg></svg></a><a aria-label="Download History" href="/downloads"><svg></svg></a></div>
    <div><a aria-label="Bookmarks" href="/bookmarks"><svg></svg></a></div>
    <div><button id="type" aria-label="Select asset type" aria-haspopup="menu" aria-expanded="false">Photos<svg></svg></button></div></div>
    <div><a aria-label="Bookmarks" href="/bookmarks"></a>
    <button id="notifications" aria-label="Notifications" aria-haspopup="dialog" aria-expanded="false"></button>
    <button id="profile" aria-label="Profile" aria-haspopup="menu" aria-expanded="false"><img alt="Avatar of user Fixture Person"></button>
    <button id="menu" aria-label="Menu" aria-haspopup="dialog" aria-expanded="false"></button></div>
    </nav><div id="content"><div id="page"><nav id="top"><div id="search-slot"><form data-testid="nav-bar-search-form-form" data-hydrated="true" role="search"><input name="searchKeyword" type="search"></form></div>
    <div><a href="/plus">Get Unsplash+</a></div><div><button id="submit">Submit an image</button></div></nav>
    <div id="tabs"><div><div><div><div><ul><li><a href="/" aria-current="page">Featured</a></li><li><a href="/t/nature">Nature</a></li></ul></div></div></div></div></div>
    <div id="feed"><div data-testid="masonry-grid-count-three"></div></div></div></div></div></div>`;
}

export function profilePopup() {
  return `<div data-base-ui-portal><div role="presentation" style="position:absolute;transform:translate(50px,500px)">
    <div role="menu" aria-labelledby="profile" tabindex="-1" id="profile-popup">
    <a role="menuitem" tabindex="-1" href="/@fixture" id="native-profile"><img alt="Avatar of user Fixture Person"><span>Fixture Person</span><span>View profile</span></a>
    <div role="separator"></div><a role="menuitem" tabindex="-1" href="https://unsplash.com/account">Account settings</a>
    <div><button role="menuitem" tabindex="-1" type="button">Submit an image</button></div><div role="separator"></div>
    <form action="/nlogout" method="post"><button type="submit" role="menuitem" tabindex="-1"><span>Logout @fixture</span></button></form>
    </div></div></div>`;
}
