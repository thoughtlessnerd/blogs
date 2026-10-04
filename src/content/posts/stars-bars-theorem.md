---
title: Stars & Bars theorem
description: ''
type: math
pubDate: '2026-10-04'
---
### The problem
In how many ways can $n$ identical elements (stars) be divided into $k$ unlabeled groups?

---

So, Most of you already know the formula, which goes like

$$ \binom{n + k - 1}{k} \text{ or } \binom{n + k - 1}{n-1} $$

where $n$ is the number of stars and $k$ is the number of divisions that need to be done of these stars.

_But, how does this come to be?_

Imagine $n(=5)$ elements in a row like this:

![* * * * *](../../assets/posts/stars-bars-theorem/image.png)

$$ \text{fig - 1.1} $$

lets divide these elements into $k(=3)$ groups, there are multiple ways to do it.

![* | * * | * *](../../assets/posts/stars-bars-theorem/image-1.png)

$$ \text{fig - 1.2, groups formed (1,2,2)} $$

$$\text{or}$$

![| * * * * | *](../../assets/posts/stars-bars-theorem/image-2.png)

$$ \text{fig - 1.3, groups formed (0,4,1)} $$

there are many ways to group these elements into $k(=3)$ groups. in this visualisation, it takes exactly $k-1$ lines (bars) to separate all the elements into a total of $k$ groups.

this can also be seen as the number of integer solutions for the equation:

$$ x_1 + x_2 + ... + x_k = n$$
$$ x_i \in (0,n)$$

Let's solve this where each group will have atleast 1 element i.e $ x_i \in (1, n)$. 
