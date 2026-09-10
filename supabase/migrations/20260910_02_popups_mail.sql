-- El popup pide el mail, no manda a otra página.
--
-- POR QUE
--
-- El botón que lleva a una landing tira a la basura la mitad del valor de haber
-- interrumpido: la persona hace clic, aterriza en otra página, se distrae y no
-- queda nada. El input adentro del popup convierte el aviso en una captura: el
-- visitante deja el mail donde ya está mirando, y eso entra en `leads` con su
-- atribución de campaña, o sea que se puede seguir hasta el contrato igual que
-- una consulta del formulario de contacto.
--
-- El camino de la landing no se borra —hay avisos que sí son "acá está la
-- inscripción, andá"—, pasa a ser la opción B: `accion`.
--
-- POR QUE SE VA `imagen_pos`
--
-- Había tres posiciones para la imagen (al costado, arriba, de fondo). Queda
-- una: arriba. Tres variantes de una pieza que se carga cuatro veces al año son
-- tres formas de que salga distinta cada vez, y las otras dos obligaban a un
-- modal ancho que en un celular termina siendo una foto gigante con el texto
-- abajo de todo. La columna se borra en vez de quedar sin uso: una columna
-- muerta es una pregunta que alguien se va a hacer dentro de seis meses.

alter table popups drop column if exists imagen_pos;

alter table popups
  add column if not exists accion text not null default 'mail'
    check (accion in ('mail', 'enlace'));

-- Lo que se muestra cuando la persona dejó el mail. Reemplaza al formulario en
-- el mismo lugar: cerrar el popup de golpe deja la duda de si se envió.
alter table popups
  add column if not exists mail_gracias text
    check (mail_gracias is null or length(mail_gracias) <= 120);

-- Seis segundos. Cero interrumpe antes de que la persona vea dónde entró, y
-- pasados diez ya se fue o ya está leyendo algo.
alter table popups alter column demora_s set default 6;
