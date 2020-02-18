# 前言

Vue的底层到底是怎么实现的呢？

通过手写简单的示例来学习Vue框架的运行机制。

Vue是MVVM框架，其实就是MVC框架在前端的体现，其中的控制器(Controller)由View MOdel(VM)代替。

简单来说，数据更新视图，以及视图更新影响数据这两步操作或者是双向绑定的过程由VM来执行。

而Vue就是一个VM。

Vue的可以说是开箱即用，它的使用非常简单，如下所示：

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Document</title>
</head>

<body>
    <div id="app">
        <h2>{{person.name}} -- {{person.age}}</h2>
        <h3>{{person.fav}}</h3>
        <h3>{{msg}}</h3>
        <div v-text='msg'></div>
        <div v-text='person.name'></div>
        <div v-html='htmlStr'></div>
        <input type="text" v-model='msg'>
        <button v-on:click="handleClick">v-on:click</button>
        <button @click="handleClick">@click</button>
        <a v-bind:href="https://www.bilibili.com/video/av80611222?p=3">v-bind:href</a>
    </div>
    <script src="./Vue.js"></script>
    <script>
        let vm = new Vue({
            el: '#app',
            data: {
                person: {
                    name: '海贼——王路飞',
                    age: 18,
                    fav: '宝藏'
                },
                msg: '最简单的插值',
                htmlStr: '这是v-html'
            },
            methods:{
                handleClick: function(){
                    console.log('这是一个处理点击事件的方法');
                }
            }
        });
    </script>

</body>

</html>
```

通过 new Vue 新建一个Vue实例，并将元素节点与该实例通过<font color=#f07c82> el </font> 实现双向绑定，之后h5中的元素内容跟对象数据就融为一体，开发者的关注重点可以集中在代码逻辑的设计，而不是繁琐的页面与数据绑定问题。

工作内容如下：

1. 需要实现一个Observer通过Object.defineProperty()劫持数据实现数据的监听。

2. 实现一个Dep收集各数据的监听Watcher，负责通知Watcher数据发生变化。

3. 实现Watcher对视图进行更新。

4. 实现Complier对Vue指令（v-text等）进行解析初始化，以及订阅对应的watcher。

# Vue模版的编译

第一步是将H5中的Vue模版进行编译，使得浏览器能够正确展示对应数据。

其中包括这几部分的编译：

1. 文本模版中插值表达式的编译
    也就是双括号中的值能够正确表达出来，例如{{person.name}}

2. 元素节点中模版表达式的编译
    例如 v-text、v-model、v-html、 v-on:click、 v-bind等

## MVue入口类设计

Mvue类接收一个参数对象作为初始输入，然后利用<font color=#f07c82>Compiler</font>类对模版进行编译及渲染。

```javascript
class MVue {
    constructor(options) {
        // 初始元素与数据通过options对象绑定
        this.$el = options.el;
        this.$data = options.data;
        this.$options = options;
        // 通过Compiler对象对模版进行编译，例如{{}}插值、v-text、v-html、v-model等Vue语法
        if (this.$el) {
            new Compiler(this.$el, this);
        }
    }

}
```

## Complier编译类设计

```javascript
const compileUtil = {
    getValue(expr, vm){
        // 处理 person.name 这种对象类型，取出真正的value
        return expr.split('.').reduce((data,currentVal)=>{
            return data[currentVal];
        }, vm.$data)
    },
    text(node, expr, vm) {
        let value;
        if(expr.indexOf('{{')!==-1){
            value = expr.replace(/\{\{(.+?)\}\}/g, (...args)=>{
                return this.getValue(args[1], vm);
            });
        }else{
            value = this.getValue(expr, vm);
        }
        this.updater.textUpdater(node, value);  
    },
    html(node, expr, vm) {
        const value = this.getValue(expr, vm);
        this.updater.htmlUpdater(node, value);
    },
    model(node, expr, vm) {
        const value = this.getValue(expr, vm);
        this.updater.modelUpdater(node, value);
    },
    on(node, expr, vm, detailStr) {
        let fn = vm.$options.methods && vm.$options.methods[expr];
        node.addEventListener(detailStr,fn.bind(vm), false);
    },
    bind(node, expr, vm, detailStr){
        // v-on:href='...' => href='...'
        node.setAttribute(detailStr, expr);
    },
    // 视图更新函数
    updater: {
        textUpdater(node, value) {
            node.textContent = value;
        },
        htmlUpdater(node, value){
            node.innerHTML = value;
        },
        modelUpdater(node, value){
            node.value = value;
        }
    }

}

// 编译HTML模版对象
class Compiler {
    constructor(el, vm) {
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        this.vm = vm;
        // 1. 将预编译的元素节点放入文档碎片对象中，避免DOM频繁的回流与重绘，提高渲染性能
        const fragments = this.node2fragments(this.el);
        // 2. 编译模版
        this.compile(fragments);
        // 3. 追加子元素到根元素
        this.el.appendChild(fragments);
    }
    compile(fragments) {
        // 1.获取子节点
        const childNodes = fragments.childNodes;
        // 2.递归循环编译
        [...childNodes].forEach(child => {
            // 如果是元素节点
            if (this.isElementNode(child)) {
                this.compileElement(child);
            } else {
                // 文本节点
                this.compileText(child);
            }
            //递归遍历
            if(child.childNodes && child.childNodes.length){
                this.compile(child);
            }
        })
    }
    compileElement(node) {
        let attributes = node.attributes;
        // 对于每个属性进行遍历编译
        // attributes是类数组，因此需要先转数组
        [...attributes].forEach(attr => {
            let {name,value} = attr; // v-text="msg"  v-html=htmlStr  type="text"  v-model="msg"
            if (this.isDirector(name)) { // v-text  v-html  v-mode  v-bind  v-on:click v-bind:href=''
                let [, directive] = name.split('-');
                let [compileKey, detailStr] = directive.split(':');
                // 更新数据，数据驱动视图
                compileUtil[compileKey](node, value, this.vm, detailStr);
                // 删除有指令的标签属性 v-text v-html等，普通的value等原生html标签不必删除
                node.removeAttribute('v-' + directive);
            }else if(this.isEventName(name)){
                // 如果是事件处理 @click='handleClick'
                let [, detailStr] = name.split('@');
                compileUtil['on'](node, value, this.vm, detailStr);
                node.removeAttribute('@' + detailStr);
            }

        })

    }
    compileText(node) {
        // 编译文本中的{{person.name}}--{{person.age}}
        const content = node.textContent;
        if(/\{\{(.+?)\}\}/.test(content)){
            compileUtil['text'](node, content, this.vm);
        }
    }
    isEventName(attrName){
        // 判断是否@开头
        return attrName.startsWith('@');
    }
    isDirector(attrName) {
        // 判断是否为Vue特性标签
        return attrName.startsWith('v-');
    }
    node2fragments(el) {
        // 创建文档碎片对象
        const f = document.createDocumentFragment();
        let firstChild;
        while (firstChild = el.firstChild) {
            f.appendChild(firstChild);
        }
        return f;
    }
    isElementNode(node) {
        // 元素节点的nodeType属性为 1
        return node.nodeType === 1;
    }
}
```

# 利用`Object.defineProperty()`方法实现数据的监听

Object.defineProperty()方法可以具体参考链接：http://sunyunzeng.com/JavaScript%E4%B8%AD%E7%9A%84%E5%AF%B9%E8%B1%A1/#%E8%AE%BF%E9%97%AE%E5%99%A8%E5%B1%9E%E6%80%A7

该方法可以定义对象数据在访问操作时的一些约定。

1. 定义 Observer 对象

```javascript
class Observer{
    constructor(data){
        this.observe(data);
    }
    // data是一个对象，可能嵌套其它对象，需要采用递归遍历的方式进行观察者绑定
    observe(data){
        if(data && typeof data === 'object'){
            Object.keys(data).forEach(key =>{
                this.defineReactive(data, key, data[key]);
            })
        }
    }
    // 通过 object.defineProperty方法对对象属性进行劫持
    defineReactive(obj, key, value){
        // 递归观察
        this.observe(value);
        Object.defineProperty(obj, key, {
            enumerable: true,
            configurable: false,
            get(){
                return value;
            },
            // 采用箭头函数在定义时绑定this的定义域
            set: (newVal)=>{
                if(newVal !== value){
                    this.observe(newVal);
                    value = newVal;
                }
            }
        })
    }
}
```

2. 利用Observer对象对数据进行劫持

```javascript
class MVue {
    constructor(options) {
        // 初始元素与数据通过options对象绑定
        this.$el = options.el;
        this.$data = options.data;
        this.$options = options;
        // 通过Compiler对象对模版进行编译，例如{{}}插值、v-text、v-html、v-model等Vue语法
        if (this.$el) {
            // 1. 编译模版
            new Compiler(this.$el, this);
            // 2. 创建观察者，观察数据
            new Observer(this.$data);
        }
    }
}
```

3. 定义Dep容器及Watcher对象对数据变化进行监听

```javascript
class Watcher{
    // 通过回调函数实现更新的数据通知到视图
    constructor(expr, vm, cb){
        this.expr = expr;
        this.vm = vm;
        this.cb = cb;
        this.oldVal = this.getOldVal();
    }
    // 获取旧数据
    getOldVal(){
        // 在利用getValue获取数据调用getter()方法时先把当前观察者挂载
        Dep.target = this;
        const oldVal = compileUtil.getValue(this.expr, this.vm);
        // 挂载完毕需要注销，防止重复挂载 (数据一更新就会挂载)
        Dep.target = null;
        return oldVal;
    }
    // 通过回调函数更新数据
    update(){
        const newVal = compileUtil.getValue(this.expr, this.vm);
        if(newVal !== this.oldVal){
            this.cb(newVal);
        }
    }
}

// Dep类存储watcher对象，并在数据变化时通知watcher
class Dep{
    constructor(){
        this.watcherCollector = [];
    }
    // 添加watcher
    addWatcher(watcher){
        console.log('观察者', this.watcherCollector);
        this.watcherCollector.push(watcher);
    }
    // 数据变化时通知watcher更新
    notify(){
        this.watcherCollector.forEach(w=>w.update());
    }
}
```

4. 在Observer中绑定Dev

```javascript
class Observer{
    // ... 省略
    defineReactive(obj, key, value){
        // ... 省略
        const dep = new Dep();
        Object.defineProperty(obj, key, {
            // ... 省略
            get(){
                // 订阅数据变化时，往Dev中添加观察者
                Dep.target && dep.addWatcher(Dep.target);
                return value;
            },
            // 采用箭头函数在定义时绑定this的定义域
            set: (newVal)=>{
                // ... 省略
                // 通知watcher数据发生改变
                dep.notify();
            }
        })
    }
}
```

5. 在编译工具中绑定Watcher
```javascript
const compileUtil = {
    // ... 省略
    getContent(expr, vm){
        // {{person.name}}--{{person.age}}
        // 防止修改person.name使得所有值全部被替换
        return expr.replace(/\{\{(.+?)\}\}/g, (...args)=>{
            return this.getValue(args[1], vm);
        });
    },
    text(node, expr, vm) {
        let value;
        if(expr.indexOf('{{')!==-1){
            value = expr.replace(/\{\{(.+?)\}\}/g, (...args)=>{
                // text的 Watcher应在此绑定，因为是对插值{{}}进行双向绑定
                // Watcher的构造函数的 getOldVal()方法需要接受数据或者对象，而{{person.name}}不能接收
                new Watcher(args[1], vm, ()=>{
                    this.updater.textUpdater(node, this.getContent(expr, vm));
                });
                return this.getValue(args[1], vm);
            });
        }else{
            value = this.getValue(expr, vm);
        }
        this.updater.textUpdater(node, value);  
    },
    html(node, expr, vm) {
        let value = this.getValue(expr, vm);
        // html对应的 Watcher
        new Watcher(expr, vm, (newVal)=>{
            this.updater.htmlUpdater(node, newVal);
        })
        this.updater.htmlUpdater(node, value);
    }
```

6. 在MVue类的构造函数中绑定Observer

```javascript
class MVue {
    constructor(options) {
        this.$el = options.el;
        this.$data = options.data;
        this.$options = options;
        if (this.$el) {
            // 1. 创建观察者
            new Observer(this.$data);
            // 2. 编译模版
            new Compiler(this.$el, this);
        }
    }
}
```

# 实现数据的双向绑定

之前我们已经实现数据影响视图，即数据更新调用setter()方法里绑定的方法，通过Dev通知Watcher更新视图。

然后我们需要实现视图影响数据进而再影响视图。

通过为input节点利用Object.addEventListener()绑定事件监听，再调用数据更新方法更新数据。

数据更改后由于之前已经实现了数据更改后页面的自动更新，由此数据自然驱动视图。

```javascript
// 编译模版具体执行
const compileUtil = {
    // ... 省略
    model(node, expr, vm) {
        const value = this.getValue(expr, vm);
        // v-model绑定对应的 Watcher, 数据驱动视图
        new Watcher(expr, vm, (newVal)=>{
            this.updater.modelUpdater(node, newVal);
        });
        // 视图 => 数据 => 视图
        node.addEventListener('input', (e)=>{
            this.setVal(expr, vm, e.target.value);
        })
        this.updater.modelUpdater(node, value);
    }
}
```
# this.$data的代理

我们可以通过在vm对象中使用this.person.name直接修改数据，而不是通过this.$data.person.name实现。

利用this.$data的代理实现。

```html
<script>
        let vm = new MVue({
            el: '#app',
            data: {
                person: {
                    name: '海贼——王路飞',
                    age: 18,
                    fav: 'film'
                },
                msg: '最简单的插值',
                htmlStr: '<h3>这是v-html</h3>'
            },
            methods:{
                handleClick: function(){
                    console.log('这是一个处理点击事件的方法');
                    // 使用代理的方式可以直接这样修改数据
                    this.person.name = '海贼王——路飞'
                }
            }
        });
    </script>
```

```javascript
class MVue {
    constructor(options) {
        // 初始元素与数据通过options对象绑定
        this.$el = options.el;
        this.$data = options.data;
        this.$options = options;
        // 通过Compiler对象对模版进行编译，例如{{}}插值、v-text、v-html、v-model等Vue语法
        if (this.$el) {
            // ... 省略
            // 通过数据代理实现 this.person.name = '海贼王——路飞'功能，而不是this.$data.person.name = '海贼王——路飞'
            this.proxyData(this.$data);
        }
    }
     //用vm代理vm.$data
     proxyData(data){
        for(let key in data){
            Object.defineProperty(this,key,{
                get(){
                    return data[key];
                },
                set(newVal){
                    data[key] = newVal;
                }
            })
        }
    }
}
```
