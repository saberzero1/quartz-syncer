---
title: Datacore
description: Whether to enable support for the Datacore plugin. Requires Datacore to be installed and enabled.
created: 2025-06-09T20:48:56Z+0200
modified: 2025-08-07T09:14:15Z+0200
publish: true
tags: [datacore, integration, settings/integrations]
default_value: "false"
---

> [!WARNING] Datacore is still in early development
>
> Not all features may work correctly

## Supported features

### Datacore Views

```js title="datacorejsx"
return function View() {
  return <p>Hello!</p>;
}
```

```datacorejsx
return function View() {
  return <p>Hello!</p>;
}
```

### Datacore Lists

```js title="datacorejsx"
return function View() {
  const pages = dc.useQuery('@page and #datacore');
  
  return <dc.List rows={pages} renderer={pages => pages.$link} />;
}
```

```datacorejsx
return function View() {
  const pages = dc.useQuery('@page and #datacore');
  
  return <dc.List rows={pages} renderer={pages => pages.$link} />;
}
```

### Datacore Tables

```js title="datacorejsx"
return function View() {
  const pages = dc.useQuery("@page and #datacore");

  const COLUMNS = [
    {id: "Name", value: page => page.$link},
    {id: "Tags", value: page => page.$tags}
  ];
  
  return <dc.Table rows={pages} columns={COLUMNS} />;
}
```

```datacorejsx
return function View() {
  const pages = dc.useQuery("@page and #datacore");

  const COLUMNS = [
    {id: "Name", value: page => page.$link},
    {id: "Tags", value: page => page.$tags}
  ];
  
  return <dc.Table rows={pages} columns={COLUMNS} />;
}
```

### Datacore Cards

```js title="datacorejsx"
return function View() {
  return <dc.Card title={"Test"} content={"Testing out a card"} footer={"Hello!"} />;
}
```

```datacorejsx
return function View() {
  return <dc.Card title={"Test"} content={"Testing out a card"} footer={"Hello!"} />;
}
```

### Datacore Callouts

```js title="datacorejsx"
return function View() {
  return <dc.Callout title={"Test"} collapsible={true} open={true}>Hello!</dc.Callout>;
}
```

```datacorejsx
return function View() {
  return <dc.Callout title={"Test"} collapsible={true} open={true}>Hello!</dc.Callout>;
}
```

## Advanced

<!--
```datacorejsx
return function View() {
  const pages = dc.useQuery("@page and #integration").sort();

  const cards = dc.useArray(pages, array => array.map((page) => (
	<article>
	  <img src=""></img>
	  <h2>{page.value("title")}</h2>
	  <div>
		<p>{page.value("description")}</p>
		<a href={`/${page.$path}`}>Link</a>
	  </div>
	</article>
  )));

  let cardMap = "";

  for (let index = 0; index < pages.length + 2; index++) {
	cardMap += `
	  &:nth-child(${index + 1}) {
	  --i: ${index};
	}
  `;
  }

  const styles = `
	.carousel-container {
	  place-items: center;
	  display: flex;
	}
	.carousel {
	  --items: ${pages.length};
	  --carousel-duration: 40s;
	  @media (width > 600px) {
		--carousel-duration: 30s;
	  }
	  --carousel-width: min(80vw,
		1200px);
	  /* note - it will "break" if it gets too wide and there aren't enough items */
	  --carousel-item-width: 280px;
	  --carousel-item-height: 450px;
	  --carousel-item-gap: 2rem;
	  --clr-cta: rgb(0, 132, 209);
	  position: relative;
	  width: var(--carousel-width);
	  height: var(--carousel-item-height);
	  overflow: clip;
	  &[mask] {
		/* fade out on sides */
		mask-image: linear-gradient(to right,
			transparent,
			black 10% 90%,
			transparent);
	  }
	  &[reverse]>article {
		animation-direction: reverse;
	  }
	  /* hover pauses animation */
	  &:hover>article {
		animation-play-state: paused;
	  }
	}
	.carousel>article {
	  position: absolute;
	  top: 0;
	  left: calc(100% + var(--carousel-item-gap));
	  width: var(--carousel-item-width);
	  height: var(--carousel-item-height);
	  display: grid;
	  grid-template-rows: 200px auto 1fr auto;
	  gap: 0.25rem;
	  border: 1px solid light-dark(rgba(0 0 0 / 0.25), rgba(255 255 255 / 0.15));
	  padding-block-end: 1rem;
	  border-radius: 10px;
	  background: light-dark(white, rgba(255 255 255 / 0.05));
	  color: light-dark(rgb(49, 65, 88), white);
	  /* animation */
	  will-change: transform;
	  animation-name: marquee;
	  animation-duration: var(--carousel-duration);
	  animation-timing-function: linear;
	  animation-iteration-count: infinite;
	  animation-delay: calc(var(--carousel-duration) / var(--items) * 1 * var(--i) * -1);
	  ${cardMap}
	}
	.carousel img {
	  width: 100%;
	  height: 100%;
	  object-fit: cover;
	  border-radius: 10px 10px 0 0;
	}
	.carousel>article>*:not(img) {
	  padding: 0 1rem;
	}
	.carousel>article>div {
	  grid-row: span 2;
	  display: grid;
	  grid-template-rows: subgrid;
	  font-size: 0.8rem;
	}
	.carousel>article h2 {
	  font-size: 1.2rem;
	  font-weight: 300;
	  padding-block: 0.75rem 0.25rem;
	  margin: 0;
	}
	.carousel>article p {
	  margin: 0;
	}
	.carousel>article a {
	  text-decoration: none;
	  text-transform: lowercase;
	  border: 1px solid var(--clr-cta);
	  color: light-dark(var(--clr-cta), white);
	  border-radius: 3px;
	  padding: 0.25rem 0.5rem;
	  place-self: start;
	  transition: 150ms ease-in-out;
	  &:hover,
	  &:focus-visible {
		background-color: var(--clr-cta);
		color: white;
		outline: none;
	  }
	}
	@keyframes marquee {
	  100% {
		transform: translateX(calc((var(--items) * (var(--carousel-item-width) + var(--carousel-item-gap))) * -1));
	  }
	}
  `;

  return (
	<div class="carousel-container">
	  <style>{styles}</style>
	  <div class="carousel" mask>
		{cards}
	  </div>
	</div>
  );
};
```
-->

## See also

- [Obsidian Rocks article on Datacore](https://obsidian.rocks/getting-started-with-datacore/), whose query examples are rendered above.
- [Datacore documentation](https://blacksmithgu.github.io/datacore/)
