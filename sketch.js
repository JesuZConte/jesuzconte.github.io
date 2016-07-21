//Curso de programación creativa. 

//variables. Para usar una variable, debemos declararla. Esto hace que el computador sepa que existe. Palabra reservada var. 
//Solo después de declararla, podemos asignarle un valor. Esto se hace con el signo =
//Javascript es debilmente tipado.
//Hay dos tipos de variables: locales y globales.

//funciones. Se declaran como function nombreFuncion(){} Para poder ejecutar una función debo poner mi función dentro de setup o de draw.

var diametro = 1;

//Función setup se ejecuta una vez al principio
function setup() {
  //crea lienzo(horizontal, vertical)
  createCanvas(400, 300);
  //fondo (rgb)
  background(255, 0, 0);
}

//función draw se ejecuta después de setup y lo hace 60 veces por segundo.
function draw() {
  //con esto se va limpiando y no queda la estela
  background(255, 0, 0);
  estiloUno();
  ellipse(mouseX, mouseY, diametro, diametro);
  diametro = diametro + 1;
}

function estiloUno(){
  var anchoBorde = 10;
  //ellipse dibuja una elipse. requiere (posx, posy, ancho, alto)
  //ellipse(100, 50, 30, 40);
  //siempre parte con un pincel por defecto. Borde negro, 1px, fondo blanco. Todo esto se puede cambiar a través de funciones.
  //Lo ideal sería definir primero el tamaño de la elipse.
  strokeWeight(10);
  //stroke es el color del borde
  stroke(210, 0, 100);
  //fill es el color del relleno
  fill(0, 0, 0);
  //noFill();
}