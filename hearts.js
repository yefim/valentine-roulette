function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const createHearts = ($el) => {
  const numHearts = $el.offsetWidth / 50 * 5;
  for (let i = 0; i < numHearts; i++) {
    const $heart = document.createElement('span');
    $heart.innerText = '🤍';
    $heart.className = 'heart-particle';
    $heart.style.top = rand(20, 80) + '%';
    $heart.style.left = rand(0, 95) + '%';
    $heart.style['animation-delay'] = rand(0, 30) / 10 + 's';

    $el.appendChild($heart);
  }
};
