const displays = document.querySelectorAll(".display")
const btns_view = document.querySelectorAll(".bntview")

btns_view.forEach((btn,index) =>{
    
    btn.addEventListener("click", (e) =>{
        btns_view.forEach(btns =>{
            btns.style.backgroundColor = "white"
        })
        e.preventDefault()
        mudar_display(index)
        btn.style.backgroundColor = "rgb(0,0,255,0.2)"
    })
})

function mudar_display(n)
{
    displays.forEach((disp) =>{
        disp.style.left = "100%"
    })
    switch (n) {
        case n:
            displays[n].style.left = "auto";
            break;
        default:
            break;
    }
}


//variável global para verificar se o user está logado 
let logado = false

//logar
const form_login = document.getElementById("form_login")
form_login.addEventListener("submit", async (e)=>{
    e.preventDefault()
    let formData = new FormData(form_login);
    let dadosform =Object.fromEntries(formData.entries());
    // console.log(dadosform);
    try {
        const resultado = await fetch("http://localhost:4000/login", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosform)
        })  
        const result = await resultado.json()
        console.log(result);
        if(result.msg)
        {
            alert(result.msg)
            return
        }
        if (!resultado.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        form_login.reset()
        if(result.sucesso)
        {
            window.location.href = result.redirectUrl;
        }
    } catch (error) {
        console.error(error.message);
    }
    
})

//verificar se o caba ta logado
async function verificar_login()
{
    const hello = document.getElementById("hello_user")
    hello.innerHTML = "Faça seu login!"
    try {
        const dados = await fetch("http://localhost:4000/api/usuario")
        const resultado = await dados.json()
        console.log(resultado);
        if(!resultado.username)
        {
            throw new Error("Usuário não logado")
        }
        hello.innerHTML = `Olá ${resultado.username}!`
        localStorage.setItem("logado",true)
        return true
    } catch (error) {
        console.log(error)
        hello.innerHTML = "Faça seu login!"
        return false
    }
    
}
verificar_login()

//criar post
const btn_criar_post = document.getElementById("criar_post")
async function criar_post()
{
    const criar_post_msg = document.getElementById("criar_post_msg")
    const form_post = document.getElementById("form_post")

    verificar_login().then(result=>{
        if(!result)
        {
            criar_post_msg.innerHTML = "Faça login para criar post"
            form_post.style.display = "none"
        }
        else
        {
            criar_post_msg.innerHTML = "Criar Post"
            form_post.style.display = "flex"
        }
    })
}
btn_criar_post.addEventListener("click",(e)=>{
    criar_post()
})

//carregar posts
const ver_posts = document.getElementById("ver_posts")
async function carregar_posts() {
    try {
        const resposta = await fetch("http://localhost:4000/ver_posts");
        
        if (!resposta.ok) {
          throw new Error(`Erro na requisição: ${resposta.status}`);
        }
        
        const result = await resposta.json();
        const posts_criados = document.getElementById("posts_criados");
        posts_criados.innerHTML = "";

        result.forEach(post => {
            const isoDate = post.createdAt;
            const date = new Date(isoDate);
            const dataEHorario = date.toLocaleString('pt-BR');

            // Proteção caso o post venha sem autor populado por algum motivo antigo
            const nomeAutor = post.autor ? `${post.autor.nome} ${post.autor.sobrenome}` : "Usuário desconhecido";

            posts_criados.innerHTML += `
            <li>
                <strong>${nomeAutor}</strong> 
                <p>${post.comentario}</p>
                <span>👍 ${post.likes || 0}</span>
                <span>👎 ${post.deslikes || 0}</span>
                <span>${dataEHorario}</span>
            </li>
            `;
        });
        
    } catch (error) {
        console.error("Erro ao carregar posts:", error.message);
    }
}
ver_posts.addEventListener("click",(e)=>{
    carregar_posts()
})